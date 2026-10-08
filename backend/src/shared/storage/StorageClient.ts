export interface StorageClient {
  upload(fileBuffer: Buffer, destinationPath: string, mimeType: string): Promise<string>;
  download(storagePath: string): Promise<Buffer>;
  getUrl(storagePath: string): string;
  delete(storagePath: string): Promise<void>;
}
