import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { drive_v3, google } from 'googleapis';
import { SavedObject, StorageService } from './storage.interface';

/**
 * Guarda os ORIGINAIS no Google Drive do Diogo (2TB), via OAuth2 + refresh token
 * (Service Account em conta Gmail pessoal não tem cota utilizável). O thumbnail
 * continua no Postgres p/ preview instantâneo; o original é baixado sob demanda
 * pelo backend (endpoint autenticado). A chave (`key`) é o fileId do Drive.
 *
 * Env necessárias: GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN.
 * Opcional: GDRIVE_FOLDER_ID (pasta destino; se ausente, vai pra raiz do Drive).
 */
@Injectable()
export class GoogleDriveStorage implements StorageService {
  private readonly logger = new Logger(GoogleDriveStorage.name);
  private readonly drive: drive_v3.Drive;
  private readonly folderId?: string;

  constructor(config: ConfigService) {
    const clientId = config.get<string>('GDRIVE_CLIENT_ID');
    const clientSecret = config.get<string>('GDRIVE_CLIENT_SECRET');
    const refreshToken = config.get<string>('GDRIVE_REFRESH_TOKEN');
    this.folderId = config.get<string>('GDRIVE_FOLDER_ID') || undefined;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'GoogleDriveStorage: defina GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET e GDRIVE_REFRESH_TOKEN',
      );
    }

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    this.drive = google.drive({ version: 'v3', auth: oauth2 });
    this.logger.log('Google Drive storage inicializado');
  }

  async save(buffer: Buffer, opts: { ext: string; contentType?: string }): Promise<SavedObject> {
    const safeExt = (opts.ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const name = `${randomUUID()}.${safeExt}`;
    const res = await this.drive.files.create({
      requestBody: {
        name,
        parents: this.folderId ? [this.folderId] : undefined,
      },
      media: {
        mimeType: opts.contentType || 'application/octet-stream',
        body: Readable.from(buffer),
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });
    const id = res.data.id;
    if (!id) throw new Error('Google Drive não retornou o fileId');
    return { key: id, driveFileId: id, webViewLink: res.data.webViewLink || undefined };
  }

  async read(key: string): Promise<Buffer> {
    try {
      const res = await this.drive.files.get(
        { fileId: key, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(res.data as ArrayBuffer);
    } catch (err) {
      this.logger.warn(`Falha ao ler ${key} do Drive: ${(err as Error).message}`);
      throw new NotFoundException('Arquivo não encontrado no Drive');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.drive.files.delete({ fileId: key, supportsAllDrives: true });
    } catch (err) {
      this.logger.warn(`Falha ao remover ${key} do Drive: ${(err as Error).message}`);
    }
  }
}
