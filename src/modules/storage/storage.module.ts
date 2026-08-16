import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleDriveStorage } from './google-drive.storage';
import { LocalDiskStorage } from './local-disk.storage';
import { WordpressStorage } from './wordpress.storage';
import { STORAGE_SERVICE, StorageService } from './storage.interface';

/**
 * Fornece a StorageService globalmente. O driver é escolhido em runtime via env:
 *   - STORAGE_DRIVER=wordpress → WordPress (Biblioteca de Mídia)
 *   - STORAGE_DRIVER=gdrive    → Google Drive (OAuth2)
 *   - auto (vazio): usa WordPress se WP_* setado; senão Drive se GDRIVE_* setado; senão LocalDisk
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
        const hasWp = Boolean(
          config.get<string>('WP_BASE_URL') &&
            config.get<string>('WP_USER') &&
            config.get<string>('WP_APP_PASSWORD'),
        );
        const hasGdrive = Boolean(
          config.get<string>('GDRIVE_CLIENT_ID') &&
            config.get<string>('GDRIVE_CLIENT_SECRET') &&
            config.get<string>('GDRIVE_REFRESH_TOKEN'),
        );

        const useWp = driver === 'wordpress' || driver === 'wp' || (driver === '' && hasWp);
        const useDrive =
          driver === 'gdrive' || driver === 'drive' || (driver === '' && !hasWp && hasGdrive);

        if (useWp) {
          logger.log('Storage backend: WordPress');
          return new WordpressStorage(config);
        }
        if (useDrive) {
          logger.log('Storage backend: Google Drive');
          return new GoogleDriveStorage(config);
        }
        logger.warn('Storage backend: LocalDisk (efêmero — configure WP_* ou GDRIVE_* em produção)');
        return new LocalDiskStorage(config);
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
