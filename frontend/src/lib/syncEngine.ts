/**
 * Kisan-Mitra Sync Engine
 * Offline-first IndexedDB with AES-256 encryption and exponential backoff sync.
 * 
 * Schema includes:
 * - isSynced (0 or 1)
 * - retry_count (int)
 * - created_at (timestamp)
 * - plus_code (handoff ID from field centroid)
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

// AES-256 encryption utilities using Web Crypto API
const ENCRYPTION_KEY_NAME = 'kisan-mitra-aes-key';

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(ENCRYPTION_KEY_NAME);
  
  if (stored) {
    const keyData = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }
  
  // Generate new 256-bit key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  // Store key (in production, use more secure key storage)
  const exported = await crypto.subtle.exportKey('raw', key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  localStorage.setItem(ENCRYPTION_KEY_NAME, b64);
  
  return key;
}

async function encryptData(data: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  
  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decryptData(encrypted: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

// Database schema
interface KisanMitraDB extends DBSchema {
  diagnoses: {
    key: string;
    value: {
      id: string;
      plus_code: string;
      data: string; // Encrypted JSON
      isSynced: number;
      retry_count: number;
      created_at: number;
    };
    indexes: {
      'by-sync': number;
      'by-created': number;
    };
  };
  prices: {
    key: string;
    value: {
      id: string;
      commodity: string;
      data: string; // Encrypted JSON
      isSynced: number;
      retry_count: number;
      created_at: number;
    };
    indexes: {
      'by-sync': number;
      'by-created': number;
    };
  };
  parcels: {
    key: string;
    value: {
      id: string;
      plus_code: string;
      s2_cell: string;
      data: string; // Encrypted JSON
      isSynced: number;
      retry_count: number;
      created_at: number;
    };
    indexes: {
      'by-sync': number;
      'by-plus-code': string;
    };
  };
}

let dbInstance: IDBPDatabase<KisanMitraDB> | null = null;

async function getDB(): Promise<IDBPDatabase<KisanMitraDB>> {
  if (dbInstance) return dbInstance;
  
  dbInstance = await openDB<KisanMitraDB>('kisan-mitra-db', 1, {
    upgrade(db) {
      // Diagnoses store
      const diagnosesStore = db.createObjectStore('diagnoses', { keyPath: 'id' });
      diagnosesStore.createIndex('by-sync', 'isSynced');
      diagnosesStore.createIndex('by-created', 'created_at');
      
      // Prices store
      const pricesStore = db.createObjectStore('prices', { keyPath: 'id' });
      pricesStore.createIndex('by-sync', 'isSynced');
      pricesStore.createIndex('by-created', 'created_at');
      
      // Parcels store
      const parcelsStore = db.createObjectStore('parcels', { keyPath: 'id' });
      parcelsStore.createIndex('by-sync', 'isSynced');
      parcelsStore.createIndex('by-plus-code', 'plus_code');
    },
  });
  
  return dbInstance;
}

// CRUD Operations with encryption
export async function saveDiagnosis(diagnosis: {
  plus_code: string;
  image_base64: string;
  result: any;
  location?: { lat: number; lng: number };
}): Promise<string> {
  const db = await getDB();
  const id = `diag_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const encrypted = await encryptData(JSON.stringify(diagnosis));
  
  await db.put('diagnoses', {
    id,
    plus_code: diagnosis.plus_code,
    data: encrypted,
    isSynced: 0,
    retry_count: 0,
    created_at: Date.now(),
  });
  
  return id;
}

export async function getDiagnosis(id: string): Promise<any | null> {
  const db = await getDB();
  const record = await db.get('diagnoses', id);
  if (!record) return null;
  
  const decrypted = await decryptData(record.data);
  return { ...record, data: JSON.parse(decrypted) };
}

export async function savePrice(price: {
  commodity: string;
  prices: any[];
  forecast: any[];
}): Promise<string> {
  const db = await getDB();
  const id = `price_${price.commodity}_${Date.now()}`;
  const encrypted = await encryptData(JSON.stringify(price));
  
  await db.put('prices', {
    id,
    commodity: price.commodity,
    data: encrypted,
    isSynced: 0,
    retry_count: 0,
    created_at: Date.now(),
  });
  
  return id;
}

export async function getPendingRecords(store: 'diagnoses' | 'prices' | 'parcels'): Promise<any[]> {
  const db = await getDB();
  return db.getAllFromIndex(store, 'by-sync', 0);
}

// Sync Engine with Exponential Backoff (2^n + jitter)
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function calculateBackoff(retryCount: number): number {
  const exponential = Math.pow(2, retryCount) * BASE_DELAY_MS;
  const jitter = Math.random() * 1000;
  return exponential + jitter;
}

async function syncRecord(
  store: 'diagnoses' | 'prices' | 'parcels',
  record: any,
  apiEndpoint: string
): Promise<boolean> {
  const db = await getDB();
  
  try {
    const decrypted = await decryptData(record.data);
    const payload = JSON.parse(decrypted);
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (response.ok) {
      // Mark as synced
      await db.put(store, { ...record, isSynced: 1 });
      return true;
    }
    
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    // Increment retry count
    const newRetryCount = record.retry_count + 1;
    
    if (newRetryCount <= MAX_RETRIES) {
      await db.put(store, { ...record, retry_count: newRetryCount });
    }
    
    return false;
  }
}

let syncIntervalId: NodeJS.Timeout | null = null;

export function startSyncEngine(apiBaseUrl: string): void {
  if (syncIntervalId) return;
  
  const sync = async () => {
    if (!navigator.onLine) return;
    
    const db = await getDB();
    
    // Get unsynced records ordered by created_at ASC
    const stores: Array<{ name: 'diagnoses' | 'prices' | 'parcels'; endpoint: string }> = [
      { name: 'diagnoses', endpoint: `${apiBaseUrl}/api/sync/diagnoses` },
      { name: 'prices', endpoint: `${apiBaseUrl}/api/sync/prices` },
      { name: 'parcels', endpoint: `${apiBaseUrl}/api/sync/parcels` },
    ];
    
    for (const { name, endpoint } of stores) {
      const pending = await getPendingRecords(name);
      // Sort by created_at ascending
      pending.sort((a, b) => a.created_at - b.created_at);
      
      for (const record of pending) {
        if (record.retry_count >= MAX_RETRIES) continue;
        
        const delay = calculateBackoff(record.retry_count);
        await new Promise(r => setTimeout(r, delay));
        
        await syncRecord(name, record, endpoint);
      }
    }
  };
  
  // Poll every 30 seconds
  syncIntervalId = setInterval(sync, 30000);
  
  // Also sync when coming online
  window.addEventListener('online', sync);
  
  // Initial sync
  sync();
}

export function stopSyncEngine(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  const diagnoses = await db.countFromIndex('diagnoses', 'by-sync', 0);
  const prices = await db.countFromIndex('prices', 'by-sync', 0);
  const parcels = await db.countFromIndex('parcels', 'by-sync', 0);
  return diagnoses + prices + parcels;
}
