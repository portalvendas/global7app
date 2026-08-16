export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface SavedObject {
  key: string;
  /** Preenchidos quando o backend é o Google Drive (auditoria/link direto). */
  driveFileId?: string;
  webViewLink?: string;
}

/**
 * Abstração de armazenamento de binários (fotos/mapas). A implementação atual é
 * LocalDisk (stopgap); na fase 3 troca-se por Google Drive / S3-R2 atrás desta
 * mesma interface, sem tocar no módulo de Daily Production.
 */
export interface StorageService {
  save(buffer: Buffer, opts: { ext: string; contentType?: string }): Promise<SavedObject>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
