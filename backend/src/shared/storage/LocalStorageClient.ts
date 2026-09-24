import fs from 'fs/promises';
import path from 'path';
import { StorageClient } from './StorageClient';
import { env } from '../../config/env';

export class LocalStorageClient implements StorageClient {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = path.resolve(env.UPLOAD_DIR);
  }

  async upload(fileBuffer: Buffer, destinationPath: string, _mimeType: string): Promise<string> {
    const fullPath = path.join(this.baseDir, destinationPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, fileBuffer);
    return `/${env.UPLOAD_DIR}/${destinationPath}`;
  }

  getUrl(storagePath: string): string {
    return storagePath;
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, storagePath.replace(`/${env.UPLOAD_DIR}/`, ''));
    await fs.unlink(fullPath).catch(() => {});
  }
}
