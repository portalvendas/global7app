import { Global, Module } from '@nestjs/common';
import { LocalDiskStorage } from './local-disk.storage';
import { STORAGE_SERVICE } from './storage.interface';

/**
 * Fornece a StorageService globalmente. Trocar o `useClass` aqui (por
 * DriveStorage/R2Storage) é o único ponto a mexer quando o backend de arquivos
 * mudar na fase 3.
 */
@Global()
@Module({
  providers: [{ provide: STORAGE_SERVICE, useClass: LocalDiskStorage }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
