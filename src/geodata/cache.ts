import type { CachedGeoDataShard } from './types';

export interface GeoDataShardCache {
  prepareVersion(catalogVersion: string): Promise<void>;
  get(key: string): Promise<CachedGeoDataShard | undefined>;
  put(record: CachedGeoDataShard): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryGeoDataShardCache implements GeoDataShardCache {
  private catalogVersion: string | undefined;
  private readonly records = new Map<string, CachedGeoDataShard>();

  prepareVersion(catalogVersion: string): Promise<void> {
    if (this.catalogVersion !== catalogVersion) {
      this.records.clear();
      this.catalogVersion = catalogVersion;
    }
    return Promise.resolve();
  }

  get(key: string): Promise<CachedGeoDataShard | undefined> {
    return Promise.resolve(this.records.get(key));
  }

  put(record: CachedGeoDataShard): Promise<void> {
    this.records.set(record.key, record);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.records.delete(key);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.records.clear();
    return Promise.resolve();
  }
}

const SHARD_STORE = 'shards';
const META_STORE = 'metadata';
const CATALOG_VERSION_KEY = 'catalog-version';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed.')), {
      once: true,
    });
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')),
      { once: true },
    );
  });
}

export class IndexedDbGeoDataShardCache implements GeoDataShardCache {
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(
    private readonly databaseName = 'geotype-geodata',
    private readonly indexedDbFactory: IDBFactory | undefined = globalThis.indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (!this.indexedDbFactory) {
      return Promise.reject(new Error('IndexedDB is not available in this environment.'));
    }

    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = this.indexedDbFactory?.open(this.databaseName, 1);
      if (!request) {
        reject(new Error('IndexedDB is not available in this environment.'));
        return;
      }

      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SHARD_STORE)) {
          database.createObjectStore(SHARD_STORE, { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE);
        }
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener(
        'error',
        () => reject(request.error ?? new Error('Unable to open the geodata cache.')),
        { once: true },
      );
    });

    return this.databasePromise;
  }

  async prepareVersion(catalogVersion: string): Promise<void> {
    const database = await this.open();
    const readTransaction = database.transaction(META_STORE, 'readonly');
    const versionRequest = readTransaction
      .objectStore(META_STORE)
      .get(CATALOG_VERSION_KEY) as IDBRequest<string | undefined>;
    const storedVersion = await requestResult(versionRequest);

    if (storedVersion === catalogVersion) return;

    const writeTransaction = database.transaction([META_STORE, SHARD_STORE], 'readwrite');
    writeTransaction.objectStore(SHARD_STORE).clear();
    writeTransaction.objectStore(META_STORE).put(catalogVersion, CATALOG_VERSION_KEY);
    await transactionComplete(writeTransaction);
  }

  async get(key: string): Promise<CachedGeoDataShard | undefined> {
    const database = await this.open();
    const transaction = database.transaction(SHARD_STORE, 'readonly');
    const request = transaction
      .objectStore(SHARD_STORE)
      .get(key) as IDBRequest<CachedGeoDataShard | undefined>;
    return requestResult(request);
  }

  async put(record: CachedGeoDataShard): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(SHARD_STORE, 'readwrite');
    transaction.objectStore(SHARD_STORE).put(record);
    await transactionComplete(transaction);
  }

  async delete(key: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(SHARD_STORE, 'readwrite');
    transaction.objectStore(SHARD_STORE).delete(key);
    await transactionComplete(transaction);
  }

  async clear(): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(SHARD_STORE, 'readwrite');
    transaction.objectStore(SHARD_STORE).clear();
    await transactionComplete(transaction);
  }
}

export function createDefaultGeoDataShardCache(): GeoDataShardCache {
  return globalThis.indexedDB
    ? new IndexedDbGeoDataShardCache()
    : new MemoryGeoDataShardCache();
}
