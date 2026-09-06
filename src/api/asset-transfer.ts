// Separate from ASC JSON:API authorization. Concrete implementation is Phase 07.
export interface AssetUploadOperation {
  method: string;
  url: string;
  offset: number;
  length: number;
  headers: Readonly<Record<string, string>>;
}
export interface AssetTransfer {
  transfer(operation: AssetUploadOperation, bytes: AsyncIterable<Uint8Array>, signal: AbortSignal): Promise<void>;
}
