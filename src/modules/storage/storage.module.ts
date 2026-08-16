import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleDriveStorage } from './google-drive.storage';
import { LocalDiskStorage } from './local-disk.storage';
import { STORAGE_SERVICE, StorageService } from './storage.interface';

/**
 * Fornece a StorageService globalmente. O driver é escolhido em runtime:
 *   - STORAGE_DRIVER=gdrive (ou credenciais GDRIVE_* presentes) → Google Drive
 *   - caso contrário → LocalDisk (efêmero; só p/ dev)
 * Trocar o backend é só mexer em variável de ambiente — nada no módulo de Daily.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageService => {
        const logger = new Logger('StorageModule');
        const driver = (config.get<string>('STORAGE_DRIVER') || '').trim().toLowerCase();
        const hasGdrive = Boolean(
          config.get<string>('GDRIVE_CLIENT_ID') &&
            config.get<string>('GDRIVE_CLIENT_SECRET') &&
            config.get<string>('GDRIVE_REFRESH_TOKEN'),
        );
        const useDrive = driver === 'gdrive' || driver === 'drive' || (driver === '' && hasGdrive);
        if (useDrive) {
          logger.log('Storage backend: Google Drive');
          return new GoogleDriveStorage(config);
        }
        logger.warn('Storage backend: LocalDisk (efêmero — configure GDRIVE_* em produção)');
        return new LocalDiskStorage(config);
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
