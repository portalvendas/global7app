'use client';

import Dexie, { Table } from 'dexie';

export interface DraftDaily {
  clientUuid: string;        // chave (idempotência)
  projectId: string;
  teamId: string;
  productionDate: string;    // YYYY-MM-DD
  description: string;
  gpsLat?: number;
  gpsLng?: number;
  serverId?: string;         // id no backend após sync
  synced: boolean;
  updatedAt: number;
}

export interface QueuedPhoto {
  id?: number;
  clientUuid: string;        // a qual daily pertence
  type: 'PRODUCTION_PHOTO' | 'MAP_PHOTO';
  blob: Blob;                // já comprimida
  filename: string;
  gpsLat?: number;
  gpsLng?: number;
  capturedAt?: string;
  uploaded: boolean;
}

class G7DB extends Dexie {
  drafts!: Table<DraftDaily, string>;
  photos!: Table<QueuedPhoto, number>;
  constructor() {
    super('global7');
    this.version(1).stores({
      drafts: 'clientUuid, synced, updatedAt',
      photos: '++id, clientUuid, uploaded',
    });
  }
}

export const db = new G7DB();
