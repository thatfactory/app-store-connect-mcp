import type { ApiClient, ApiDocument } from '../client.js';
import { resource, type Attributes, type Resource } from './discovery.js';
import { AppStoreError } from '../../errors.js';
import type { ApplePlatform, TestFlightGroup } from '../../repository/schemas.js';

export const betaLocalizationFields = ['description', 'feedbackEmail', 'marketingUrl', 'privacyPolicyUrl', 'tvOsPrivacyPolicy'];
export const betaReviewFields = ['contactFirstName', 'contactLastName', 'contactPhone', 'contactEmail',
  'demoAccountName', 'demoAccountPassword', 'demoAccountRequired', 'notes'];
const groupFields = ['name', 'isInternalGroup', 'publicLinkEnabled', 'publicLinkLimitEnabled', 'publicLinkLimit'];
const buildFields = ['version', 'processingState', 'buildAudienceType', 'expired', 'expirationDate', 'usesNonExemptEncryption'];
const externalStates = ['PROCESSING', 'PROCESSING_EXCEPTION', 'MISSING_EXPORT_COMPLIANCE',
  'READY_FOR_BETA_TESTING', 'IN_BETA_TESTING', 'EXPIRED', 'READY_FOR_BETA_SUBMISSION', 'IN_EXPORT_COMPLIANCE_REVIEW',
  'WAITING_FOR_BETA_REVIEW', 'IN_BETA_REVIEW', 'BETA_REJECTED', 'BETA_APPROVED', 'NOT_APPLICABLE'] as const;
const reviewStates = ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'REJECTED', 'APPROVED'] as const;
type ExternalState = typeof externalStates[number];
type ReviewState = typeof reviewStates[number];
export type BetaGroup = {
  id: string; name: string; publicLinkEnabled: boolean;
  publicLinkLimitEnabled: boolean | null; publicLinkLimit: number | null;
};
export type BuildIdentity = {
  id: string; appId: string; platform: ApplePlatform; version: string; buildNumber: string;
  processingState: string; audience: string; expired: boolean; expirationDate: string | null;
  usesNonExemptEncryption: boolean | null; encryptionDeclarationState: string | null;
};
export type BetaBuild = {
  identity: BuildIdentity; detailId: string; autoNotifyEnabled: boolean | null;
  externalState: ExternalState; review: {id: string; state: ReviewState} | null;
};

const invalid = (message: string) => new AppStoreError('incompleteSnapshot', message);
const linkage = <T extends string>(type: T, id: string) => ({ type, id });
const relationship = (raw: unknown, name: string, type: string): string | null => {
  const data = (raw as {relationships?: Record<string, {data?: unknown}>})?.relationships?.[name]?.data;
  return data == null ? null : resource(data, type, []).id;
};

function included(document: ApiDocument | undefined, type: string, id: string | null, fields: string[]): Resource {
  if (!id || !Array.isArray(document?.included)) throw invalid('Apple omitted a linked TestFlight resource.');
  const matches = document.included.filter(item => (item as {type?: string; id?: string})?.type === type && (item as {id?: string}).id === id);
  if (matches.length !== 1) throw invalid('Apple returned missing or ambiguous TestFlight linkage.');
  return resource(matches[0], type, fields);
}

function enumValue<T extends string>(value: unknown, values: readonly T[], message: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw invalid(message);
  return value as T;
}

function query(path: string, fields: Record<string, string>): string {
  return `${path}?${new URLSearchParams(fields)}`;
}

function betaGroup(entry: Resource): BetaGroup {
  const {name, isInternalGroup, publicLinkEnabled, publicLinkLimitEnabled, publicLinkLimit} = entry.attributes;
  if (typeof name !== 'string' || isInternalGroup !== false || typeof publicLinkEnabled !== 'boolean'
      || (publicLinkLimitEnabled != null && typeof publicLinkLimitEnabled !== 'boolean')
      || (publicLinkLimit != null && (typeof publicLinkLimit !== 'number' || !Number.isInteger(publicLinkLimit) || publicLinkLimit < 0))) {
    throw invalid('Selected external group is missing public enrollment status.');
  }
  return {id: entry.id, name, publicLinkEnabled, publicLinkLimitEnabled: publicLinkLimitEnabled ?? null, publicLinkLimit: publicLinkLimit ?? null};
}

export class TestFlightApi {
  constructor(private readonly api: ApiClient) {}

  async #one(path: string, type: string, fields: string[], signal?: AbortSignal): Promise<Resource> {
    const document = await this.api.request<ApiDocument>(path, signal ? {signal} : {});
    return resource(document?.data, type, fields);
  }

  async #list(path: string, type: string, fields: string[], signal?: AbortSignal): Promise<Resource[]> {
    const entries = (await this.api.list<unknown>(path, signal)).map(raw => resource(raw, type, fields));
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw invalid('Duplicate Apple resource IDs in TestFlight inventory.');
    return entries;
  }

  async app(appId: string, bundleId: string, signal?: AbortSignal): Promise<void> {
    const app = await this.#one(`/v1/apps/${appId}`, 'apps', ['bundleId'], signal);
    if (app.id !== appId || app.attributes.bundleId !== bundleId) {
      throw new AppStoreError('identityMismatch', 'App Store ID and bundle ID do not agree in the authenticated account.');
    }
  }

  async groups(appId: string, signal?: AbortSignal): Promise<Resource[]> {
    const groups = await this.#list(query(`/v1/apps/${appId}/betaGroups`, {'fields[betaGroups]': 'name,isInternalGroup'}), 'betaGroups', ['name', 'isInternalGroup'], signal);
    if (groups.some(group => typeof group.attributes.name !== 'string' || typeof group.attributes.isInternalGroup !== 'boolean')) {
      throw invalid('Apple omitted a TestFlight group name or audience.');
    }
    return groups;
  }

  async group(appId: string, declared: TestFlightGroup, groups: Resource[], signal?: AbortSignal): Promise<BetaGroup | null> {
    const matches = groups.filter(item => item.attributes.name === declared.name);
    if (matches.length > 1) throw new AppStoreError('ambiguousBetaGroup', 'Multiple Apple groups have the exact declared name.');
    const match = matches[0];
    if (declared.groupId && match?.id !== declared.groupId) {
      const actual = groups.find(item => item.id === declared.groupId);
      throw new AppStoreError('betaGroupIdentityMismatch', actual
        ? `Pinned group ${declared.groupId} has a different Apple name; the selected name ${match ? `belongs to group ${match.id}` : 'has no match'}.`
        : `Pinned group ${declared.groupId} is absent from the verified app; the selected name ${match ? `belongs to group ${match.id}` : 'has no match'}.`);
    }
    if (!match) return null;
    if (match.attributes.isInternalGroup) throw new AppStoreError('internalBetaGroupCollision', 'The declared name belongs to an internal group.');
    const entry = await this.#groupDetail(appId, match.id, declared.name, false, signal);
    return betaGroup(entry);
  }

  async #groupDetail(appId: string, groupId: string, name: string, link: boolean, signal?: AbortSignal): Promise<Resource> {
    const fields = [...groupFields, 'app', ...(link ? ['publicLink'] : [])];
    const path = query(`/v1/betaGroups/${groupId}`, {include:'app', 'fields[betaGroups]': fields.join(','), 'fields[apps]':'bundleId'});
    const document = await this.api.request<ApiDocument>(path, signal ? {signal} : {});
    const entry = resource(document?.data, 'betaGroups', fields);
    if (entry.id !== groupId || entry.attributes.name !== name || entry.attributes.isInternalGroup !== false
        || relationship(document?.data, 'app', 'apps') !== appId) {
      throw new AppStoreError('betaGroupIdentityMismatch', 'The selected external group no longer matches the verified app, name and ID.');
    }
    return entry;
  }

  async joinLink(appId: string, group: BetaGroup, signal?: AbortSignal): Promise<string | null> {
    const entry = await this.#groupDetail(appId, group.id, group.name, true, signal);
    if (!betaGroup(entry).publicLinkEnabled) return null;
    const link = entry.attributes.publicLink;
    if (typeof link !== 'string' || !/^https:\/\/testflight\.apple\.com\/join\/[a-z0-9]+$/i.test(link)) {
      throw new AppStoreError('publicLinkUnavailable', 'Apple has not returned a usable TestFlight join link for this enabled group.');
    }
    return link;
  }

  async members(groupId: string, signal?: AbortSignal): Promise<string[]> {
    return (await this.#list(query(`/v1/betaGroups/${groupId}/builds`, {'fields[builds]':'version'}), 'builds', [], signal)).map(entry => entry.id).sort();
  }

  async build(appId: string, buildId: string, expectedPlatform: ApplePlatform, signal?: AbortSignal): Promise<BetaBuild> {
    const path = query(`/v1/builds/${buildId}`, {
      include:'app,preReleaseVersion,appEncryptionDeclaration',
      'fields[builds]':[...buildFields,'app','preReleaseVersion','appEncryptionDeclaration'].join(','),
      'fields[preReleaseVersions]':'version,platform', 'fields[apps]':'bundleId',
      'fields[appEncryptionDeclarations]':'appEncryptionDeclarationState',
    });
    const document = await this.api.request<ApiDocument>(path, signal ? {signal} : {});
    const build = resource(document?.data, 'builds', buildFields);
    if (build.id !== buildId || relationship(document?.data, 'app', 'apps') !== appId) {
      throw new AppStoreError('wrongBuild', 'The exact build must belong to the verified app.');
    }
    const pre = included(document, 'preReleaseVersions', relationship(document?.data, 'preReleaseVersion', 'preReleaseVersions'), ['platform', 'version']);
    if (pre.attributes.platform !== expectedPlatform) throw new AppStoreError('wrongBuildPlatform', 'The exact build has a different platform than expected.');
    const {version: buildNumber, processingState, buildAudienceType, expired, expirationDate, usesNonExemptEncryption} = build.attributes;
    if (typeof buildNumber !== 'string' || !buildNumber.trim() || typeof pre.attributes.version !== 'string' || !pre.attributes.version.trim()
        || typeof expired !== 'boolean' || (expirationDate != null && (typeof expirationDate !== 'string' || !Number.isFinite(Date.parse(expirationDate))))
        || (usesNonExemptEncryption != null && typeof usesNonExemptEncryption !== 'boolean')) {
      throw invalid('Selected build is missing valid build number, marketing version, expiration, or encryption attributes.');
    }
    const declarationId = relationship(document?.data, 'appEncryptionDeclaration', 'appEncryptionDeclarations');
    const encryptionDeclarationState = declarationId
      ? enumValue(included(document, 'appEncryptionDeclarations', declarationId, ['appEncryptionDeclarationState']).attributes.appEncryptionDeclarationState,
        ['CREATED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'INVALID', 'EXPIRED'], 'Apple returned an unknown encryption declaration state.')
      : null;
    const identity = {
      id: buildId, appId, platform: expectedPlatform, version: pre.attributes.version, buildNumber,
      processingState: enumValue(processingState, ['PROCESSING', 'FAILED', 'INVALID', 'VALID'], 'Apple returned an unknown build processing state.'),
      audience: enumValue(buildAudienceType, ['APP_STORE_ELIGIBLE', 'INTERNAL_ONLY'], 'Apple omitted the build audience or returned an unknown audience.'),
      expired: expired || (typeof expirationDate === 'string' && Date.parse(expirationDate) <= Date.now()),
      expirationDate: expirationDate ?? null, usesNonExemptEncryption: usesNonExemptEncryption ?? null, encryptionDeclarationState,
    };
    const detail = await this.#one(`/v1/builds/${buildId}/buildBetaDetail`, 'buildBetaDetails', ['autoNotifyEnabled', 'externalBuildState'], signal);
    const externalState = enumValue(detail.attributes.externalBuildState, externalStates, 'Apple omitted external build status or returned an unknown status.');
    const autoNotifyEnabled = detail.attributes.autoNotifyEnabled;
    if (autoNotifyEnabled != null && typeof autoNotifyEnabled !== 'boolean') throw invalid('Apple returned an invalid auto-notify setting.');
    return {identity, detailId: detail.id, externalState, autoNotifyEnabled: autoNotifyEnabled ?? null, review: await this.#review(buildId, signal)};
  }

  async #review(buildId: string, signal?: AbortSignal): Promise<BetaBuild['review']> {
    const path = query('/v1/betaAppReviewSubmissions', {'filter[build]':buildId, include:'build',
      'fields[betaAppReviewSubmissions]':'betaReviewState,build', 'fields[builds]':'version'});
    const entries = await this.api.list<unknown>(path, signal);
    if (!entries.length) return null;
    if (entries.length !== 1) throw invalid('Multiple review records reference the selected build.');
    const entry = resource(entries[0], 'betaAppReviewSubmissions', ['betaReviewState']);
    if (relationship(entries[0], 'build', 'builds') !== buildId) throw invalid('Review record does not identify the exact build.');
    return {id:entry.id, state:enumValue(entry.attributes.betaReviewState, reviewStates, 'Apple returned an unknown beta review state.')};
  }

  async appLocalizations(appId: string, signal?: AbortSignal): Promise<Resource[]> {
    return this.#list(`/v1/apps/${appId}/betaAppLocalizations`, 'betaAppLocalizations', ['locale', ...betaLocalizationFields], signal);
  }

  async reviewDetail(appId: string, signal?: AbortSignal): Promise<Resource> {
    try {
      return await this.#one(`/v1/apps/${appId}/betaAppReviewDetail`, 'betaAppReviewDetails', betaReviewFields, signal);
    } catch (error) {
      if (error instanceof AppStoreError && error.status === 404) throw new AppStoreError('betaReviewDetailMissing', 'Create the beta review details in App Store Connect first.');
      throw error;
    }
  }

  async buildLocalizations(buildId: string, signal?: AbortSignal): Promise<Resource[]> {
    return this.#list(`/v1/builds/${buildId}/betaBuildLocalizations`, 'betaBuildLocalizations', ['locale', 'whatsNew'], signal);
  }

  async #write(path: string, method: 'POST' | 'PATCH', data: unknown, signal?: AbortSignal): Promise<void> {
    await this.api.request(path, {method, body:{data}, ...(signal ? {signal} : {})});
  }

  async createGroup(appId: string, name: string, signal?: AbortSignal): Promise<void> {
    await this.#write('/v1/betaGroups', 'POST', {type:'betaGroups',
      attributes:{name, isInternalGroup:false, publicLinkEnabled:false},
      relationships:{app:{data:linkage('apps', appId)}}}, signal);
  }

  async publicLink(groupId: string, attributes: Attributes, signal?: AbortSignal): Promise<void> {
    await this.#write(`/v1/betaGroups/${groupId}`, 'PATCH', {...linkage('betaGroups', groupId), attributes}, signal);
  }

  async localize(parent: {type:'apps' | 'builds'; id:string}, locale: string, id: string | null, attributes: Attributes, signal?: AbortSignal): Promise<void> {
    const app = parent.type === 'apps';
    const type = app ? 'betaAppLocalizations' : 'betaBuildLocalizations';
    if (id) await this.#write(`/v1/${type}/${id}`, 'PATCH', {...linkage(type, id), attributes}, signal);
    else await this.#write(`/v1/${type}`, 'POST', {type, attributes:{locale, ...attributes},
      relationships:{[app ? 'app' : 'build']:{data:parent}}}, signal);
  }

  async updateReviewDetail(id: string, attributes: Attributes, signal?: AbortSignal): Promise<void> {
    await this.#write(`/v1/betaAppReviewDetails/${id}`, 'PATCH', {...linkage('betaAppReviewDetails', id), attributes}, signal);
  }

  async autoNotify(id: string, autoNotifyEnabled: boolean, signal?: AbortSignal): Promise<void> {
    await this.#write(`/v1/buildBetaDetails/${id}`, 'PATCH', {...linkage('buildBetaDetails', id), attributes:{autoNotifyEnabled}}, signal);
  }

  async attach(groupId: string, buildId: string, signal?: AbortSignal): Promise<void> {
    await this.#write(`/v1/betaGroups/${groupId}/relationships/builds`, 'POST', [linkage('builds', buildId)], signal);
  }

  async submit(buildId: string, signal?: AbortSignal): Promise<void> {
    await this.#write('/v1/betaAppReviewSubmissions', 'POST',
      {type:'betaAppReviewSubmissions', relationships:{build:{data:linkage('builds', buildId)}}}, signal);
  }

  async notify(buildId: string, signal?: AbortSignal): Promise<void> {
    await this.#write('/v1/buildBetaNotifications', 'POST',
      {type:'buildBetaNotifications', relationships:{build:{data:linkage('builds', buildId)}}}, signal);
  }
}
