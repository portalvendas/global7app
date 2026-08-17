import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { SavedObject, StorageService } from './storage.interface';

/**
 * Guarda os ORIGINAIS na Biblioteca de Mídia do WordPress via REST API
 * (POST /wp-json/wp/v2/media), autenticando com Application Password (Basic Auth).
 *
 * Robustez: envia User-Agent/Accept (alguns WAF/ModSecurity bloqueiam requisições
 * "sem cara de cliente"), aplica timeout (AbortController) e retry com backoff em
 * falhas transitórias (rede/5xx/429). NÃO tenta de novo em 4xx (401/403/406 são
 * permanentes — ex.: bloqueio de firewall do host, que precisa ser liberado lá).
 *
 * Env: WP_BASE_URL, WP_USER, WP_APP_PASSWORD. Opcional: WP_TIMEOUT_MS (default 30000).
 */
@Injectable()
export class WordpressStorage implements StorageService {
  private readonly logger = new Logger(WordpressStorage.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly ua = 'Mozilla/5.0 (compatible; Global7App/1.0; +https://global7app.onrender.com)';

  constructor(config: ConfigService) {
    const base = config.get<string>('WP_BASE_URL');
    const user = config.get<string>('WP_USER');
    const appPassword = config.get<string>('WP_APP_PASSWORD');
    if (!base || !user || !appPassword) {
      throw new Error('WordpressStorage: defina WP_BASE_URL, WP_USER e WP_APP_PASSWORD');
    }
    this.baseUrl = base.replace(/\/+$/, '');
    this.authHeader = 'Basic ' + Buffer.from(`${user}:${appPassword}`).toString('base64');
    this.timeoutMs = Number(config.get<string>('WP_TIMEOUT_MS')) || 30_000;
    this.logger.log(`WordPress storage inicializado (${this.baseUrl})`);
  }

  private get mediaEndpoint(): string {
    return `${this.baseUrl}/wp-json/wp/v2/media`;
  }

  /** fetch com timeout + retry (só em falhas transitórias). */
  private async request(url: string, init: RequestInit, attempt = 1): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      // 5xx/429 = transitório → tenta de novo (até 3 tentativas). 4xx = permanente.
      if ((res.status >= 500 || res.status === 429) && attempt < 3) {
        this.logger.warn(`WP ${init.method || 'GET'} ${url} status ${res.status} — retry ${attempt + 1}/3`);
        await this.sleep(400 * attempt);
        return this.request(url, init, attempt + 1);
      }
      return res;
    } catch (err) {
      // erro de rede/timeout → transitório
      if (attempt < 3) {
        this.logger.warn(`WP ${init.method || 'GET'} ${url} falhou (${(err as Error).message}) — retry ${attempt + 1}/3`);
        await this.sleep(400 * attempt);
        return this.request(url, init, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async save(buffer: Buffer, opts: { ext: string; contentType?: string }): Promise<SavedObject> {
    const safeExt = (opts.ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const name = `${randomUUID()}.${safeExt}`;
    const res = await this.request(this.mediaEndpoint, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'User-Agent': this.ua,
        Accept: 'application/json',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Type': opts.contentType || 'application/octet-stream',
      },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint = res.status === 406 || res.status === 403
        ? ' (provável bloqueio de WAF/ModSecurity no host do WordPress — liberar /wp-json/wp/v2/media)'
        : '';
      throw new Error(`WordPress upload falhou (${res.status})${hint}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { id: number; source_url?: string };
    return { key: String(json.id), driveFileId: String(json.id), webViewLink: json.source_url };
  }

  async read(key: string): Promise<Buffer> {
    try {
      const metaRes = await this.request(`${this.mediaEndpoint}/${key}`, {
        headers: { Authorization: this.authHeader, 'User-Agent': this.ua, Accept: 'application/json' },
      });
      if (!metaRes.ok) throw new Error(`meta ${metaRes.status}`);
      const meta = (await metaRes.json()) as { source_url?: string };
      if (!meta.source_url) throw new Error('sem source_url');
      const fileRes = await this.request(meta.source_url, {
        headers: { Authorization: this.authHeader, 'User-Agent': this.ua },
      });
      if (!fileRes.ok) throw new Error(`download ${fileRes.status}`);
      return Buffer.from(await fileRes.arrayBuffer());
    } catch (err) {
      this.logger.warn(`Falha ao ler mídia ${key} do WP: ${(err as Error).message}`);
      throw new NotFoundException('Arquivo não encontrado no WordPress');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const res = await this.request(`${this.mediaEndpoint}/${key}?force=true`, {
        method: 'DELETE',
        headers: { Authorization: this.authHeader, 'User-Agent': this.ua, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      this.logger.warn(`Falha ao remover mídia ${key} do WP: ${(err as Error).message}`);
    }
  }
}
