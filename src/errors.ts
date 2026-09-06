export type ExecutionDisposition = 'notStarted' | 'rejected' | 'outcomeUnknown';
export class AppStoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly executionDisposition: ExecutionDisposition = 'notStarted',
    readonly status?: number,
    readonly requestId?: string,
  ) { super(message); this.name = 'AppStoreError'; }
  toJSON(): Record<string, unknown> {
    return { code: this.code, message: this.message, executionDisposition: this.executionDisposition,
      ...(this.status === undefined ? {} : {status: this.status}),
      ...(this.requestId === undefined ? {} : {requestId: this.requestId}) };
  }
}
// Never reflect upstream errors or input values; they may contain credentials.
export function publicError(error: unknown): Record<string, unknown> {
  return error instanceof AppStoreError ? error.toJSON() : {code: 'internalError', message: 'Operation failed; no sensitive details were recorded.'};
}
