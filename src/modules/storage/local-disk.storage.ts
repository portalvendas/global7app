import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { SavedObject, StorageService } from './storage.interface';

/**
 * Armazena os originais no disco local (UPLOADS_DIR). No Render Free o disco é
 * efêmero (some em redeploy) — por isso o thumbnail vive no Postgres. Para
 * produção, usar disco persistente (Render Disk) ou trocar por Drive/R2.
 */
@Injectable()
export class LocalDiskStorage implements StorageService {
  private readonly logger = new Logger(LocalDiskStorage.name);
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    this.baseDir = path.resolve(config.get<string>('UPLOADS_DIR') || path.join(process.cwd(), 'uploads'));
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async save(buffer: Buffer, opts: { ext: string; contentType?: string }): Promise<SavedObject> {
    await this.ensureDir();
    const safeExt = (opts.ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const key = `${randomUUID()}.${safeExt}`;
    await fs.writeFile(path.join(this.baseDir, key), buffer);
    return { key };
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(path.join(this.baseDir, this.sanitize(key)));
    } catch {
      throw new NotFoundException('Arquivo não encontrado no storage');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.baseDir, this.sanitize(key)));
    } catch (err) {
      this.logger.warn(`Falha ao remover ${key}: ${(err as Error).message}`);
    }
  }

  /** Impede path traversal (a chave é só o nome do arquivo). */
  private sanitize(key: string): string {
    return path.basename(key);
  }
}
