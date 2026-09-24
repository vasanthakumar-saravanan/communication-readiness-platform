export interface StorageClient {
  upload(fileBuffer: Buffer, destinationPath: string, mimeType: string): Promise<string>;
  getUrl(storagePath: string): string;
  delete(storagePath: string): Promise<void>;
}
