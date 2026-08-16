import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { SavedObject, StorageService } from './storage.interface';

/**
 * Guarda os ORIGINAIS na Biblioteca de Mídia do WordPress via REST API
 * (POST /wp-json/wp/v2/media), autenticando com Application Password (Basic Auth).
 * O thumbnail continua no Postgres p/ preview instantâneo; o original é baixado
 * sob demanda pelo backend (endpoint autenticado) ou acessível pela URL pública.
 *
 * `key` = ID da mídia no WP (usado p/ ler/remover). `webViewLink` = source_url.
 *
 * Env necessárias: WP_BASE_URL (ex.: https://seusite.com), WP_USER, WP_APP_PASSWORD.
 * A Application Password é gerada em: WP Admin → Usuários → Perfil → Senhas de aplicativo.
 */
@Injectable()
export class WordpressStorage implements StorageService {
  private readonly logger = new Logger(WordpressStorage.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: ConfigService) {
    const base = config.get<string>('WP_BASE_URL');
    const user = config.get<string>('WP_USER');
    const appPassword = config.get<string>('WP_APP_PASSWORD');
    if (!base || !user || !appPassword) {
      throw new Error('WordpressStorage: defina WP_BASE_URL, WP_USER e WP_APP_PASSWORD');
    }
    this.baseUrl = base.replace(/\/+$/, '');
    this.authHeader = 'Basic ' + Buffer.from(`${user}:${appPassword}`).toString('base64');
    this.logger.log(`WordPress storage inicializado (${this.baseUrl})`);
  }

  private get mediaEndpoint(): string {
    return `${this.baseUrl}/wp-json/wp/v2/media`;
  }

  async save(buffer: Buffer, opts: { ext: string; contentType?: string }): Promise<SavedObject> {
    const safeExt = (opts.ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const name = `${randomUUID()}.${safeExt}`;
    const res = await fetch(this.mediaEndpoint, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Type': opts.contentType || 'application/octet-stream',
      },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`WordPress upload falhou (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { id: number; source_url?: string };
    return {
      key: String(json.id),
      driveFileId: String(json.id),
      webViewLink: json.source_url,
    };
  }

  async read(key: string): Promise<Buffer> {
    try {
      const metaRes = await fetch(`${this.mediaEndpoint}/${key}`, {
        headers: { Authorization: this.authHeader },
      });
      if (!metaRes.ok) throw new Error(`meta ${metaRes.status}`);
      const meta = (await metaRes.json()) as { source_url?: string };
      if (!meta.source_url) throw new Error('sem source_url');
      const fileRes = await fetch(meta.source_url, { headers: { Authorization: this.authHeader } });
      if (!fileRes.ok) throw new Error(`download ${fileRes.status}`);
      return Buffer.from(await fileRes.arrayBuffer());
    } catch (err) {
      this.logger.warn(`Falha ao ler mídia ${key} do WP: ${(err as Error).message}`);
      throw new NotFoundException('Arquivo não encontrado no WordPress');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const res = await fetch(`${this.mediaEndpoint}/${key}?force=true`, {
        method: 'DELETE',
        headers: { Authorization: this.authHeader },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      this.logger.warn(`Falha ao remover mídia ${key} do WP: ${(err as Error).message}`);
    }
  }
}
