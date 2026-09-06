import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { AppStoreError } from '../errors.js';
import type { AuthManager } from './auth.js';
export const API_ORIGIN = 'https://api.appstoreconnect.apple.com';
export interface ApiDocument<T = unknown> { data: T; links?: {next?: string | null}; included?: unknown[] }
export interface RequestOptions { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal }
export interface ClientOptions { fetch?: typeof fetch; timeoutMs?: number; maxBytes?: number; maxPages?: number; maxItems?: number; readRetries?: number }
export class ApiClient {
  readonly #fetch: typeof fetch;
  readonly #limits: Required<Omit<ClientOptions, 'fetch'>>;
  constructor(private readonly auth: Pick<AuthManager, 'token'>, options: ClientOptions = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#limits = {timeoutMs: options.timeoutMs ?? 30_000, maxBytes: options.maxBytes ?? 4_194_304,
      maxPages: options.maxPages ?? 100, maxItems: options.maxItems ?? 10_000, readRetries: options.readRetries ?? 2};
    for (const limit of Object.values(this.#limits)) if (!Number.isSafeInteger(limit) || limit < 0) throw new AppStoreError('invalidConfiguration', 'Transport limits must be bounded non-negative integers.');
  }
  #url(path: string): URL {
    let url: URL;
    try { url = new URL(path, API_ORIGIN); } catch { throw new AppStoreError('unsafeUrl', 'Invalid Apple API URL.'); }
    if (url.origin !== API_ORIGIN || url.username || url.password || url.hash || !/^\/v[12]\//.test(url.pathname)) throw new AppStoreError('unsafeUrl', 'Only the exact public Apple API origin is allowed.');
    return url;
  }
  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T | undefined> {
    const url = this.#url(path);
    const method = options.method ?? 'GET';
    const write = method !== 'GET';
    const requestId = randomUUID();
    const signal = AbortSignal.any([AbortSignal.timeout(this.#limits.timeoutMs), ...(options.signal ? [options.signal] : [])]);
    if (signal.aborted) throw new AppStoreError('cancelled', 'Request was cancelled before dispatch.', 'notStarted', undefined, requestId);
    const token = this.auth.token();
    let body: string | undefined;
    try { body = options.body === undefined ? undefined : JSON.stringify(options.body); }
    catch { throw new AppStoreError('invalidRequest', 'Request body is not serializable.'); }
    for (let attempt = 0; ; attempt++) {
      let dispatched = false;
      try {
        signal.throwIfAborted();
        dispatched = true;
        const response = await this.#fetch(url, {method, redirect: 'error', signal,
          headers: {Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
          ...(body === undefined ? {} : {body})});
        if (!response.ok) {
          await response.body?.cancel();
          if (!write && attempt < this.#limits.readRetries && (response.status === 429 || response.status >= 500)) {
            const retryAfter = response.headers.get('retry-after');
            let milliseconds = 100 * 2 ** attempt;
            if (retryAfter) {
              const seconds = Number(retryAfter);
              milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
              if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 2000) throw new AppStoreError('rateLimited', 'Retry guidance exceeds the local retry budget.', 'rejected', response.status, requestId);
            }
            await delay(milliseconds, undefined, {signal});
            continue;
          }
          const code = response.status === 401 ? 'authenticationFailed' : response.status === 403 ? 'permissionDenied'
            : response.status === 409 ? 'conflict' : response.status === 429 ? 'rateLimited' : 'appleApiError';
          throw new AppStoreError(code, `Apple API returned HTTP ${response.status}.`, write && response.status >= 500 ? 'outcomeUnknown' : 'rejected', response.status, requestId);
        }
        if (response.status === 204) { await response.body?.cancel(); return undefined; }
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = []; let total = 0;
        const abortRead = (): void => { void reader?.cancel().catch(() => {}); };
        signal.addEventListener('abort', abortRead, {once: true});
        try {
          if (reader) for (;;) {
            signal.throwIfAborted();
            const {done, value} = await reader.read();
            signal.throwIfAborted();
            if (done) break;
            total += value.byteLength;
            if (total > this.#limits.maxBytes) throw new AppStoreError('responseTooLarge', 'Apple response exceeded the local byte limit.', write ? 'outcomeUnknown' : 'rejected', response.status, requestId);
            chunks.push(value);
          }
        } finally { signal.removeEventListener('abort', abortRead); await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
        try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks))) as T; }
        catch { throw new AppStoreError('invalidResponse', 'Apple returned an invalid JSON response.', write ? 'outcomeUnknown' : 'rejected', response.status, requestId); }
      } catch (error) {
        if (error instanceof AppStoreError) throw error;
        throw new AppStoreError(signal.aborted ? 'cancelled' : 'transportFailed', signal.aborted ? 'Apple request cancelled or timed out.' : 'Apple transport failed.', write && dispatched ? 'outcomeUnknown' : 'notStarted', undefined, requestId);
      }
    }
  }
  async list<T>(path: string, signal?: AbortSignal): Promise<T[]> {
    const result: T[] = []; const visited = new Set<string>();
    let next: string | null | undefined = path;
    while (next) {
      const url: string = this.#url(next).href;
      if (visited.has(url) || visited.size >= this.#limits.maxPages) throw new AppStoreError('incompleteSnapshot', 'Pagination loop or page limit reached.');
      visited.add(url);
      const page: ApiDocument<T[]> | undefined = await this.request<ApiDocument<T[]>>(url, signal ? {signal} : {});
      if (!page || !Array.isArray(page.data) || (page.links !== undefined && (typeof page.links !== 'object' || page.links === null)) || (page.links?.next != null && typeof page.links.next !== 'string')) throw new AppStoreError('invalidResponse', 'Expected a paginated JSON:API collection.');
      result.push(...page.data);
      if (result.length > this.#limits.maxItems) throw new AppStoreError('incompleteSnapshot', 'Collection exceeds the local item limit.');
      next = page.links?.next;
    }
    return result;
  }
}
