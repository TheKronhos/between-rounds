import Dexie, { type EntityTable } from 'dexie';
import type { LogEntry, PlanBundle, SavedFood, StoredBundle } from './types';

// All data lives in IndexedDB on this device. Nothing is sent anywhere.

export interface MetaRow {
  key: string;
  value: unknown;
}

export class BetweenRoundsDB extends Dexie {
  bundles!: EntityTable<StoredBundle, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  logs!: EntityTable<LogEntry, 'id'>;
  foods!: EntityTable<SavedFood, 'id'>;

  constructor(name = 'between-rounds') {
    super(name);
    // Schema history. Never edit a past version; add a new one.
    // Dexie carries every existing table and row forward on upgrade.
    this.version(1).stores({
      bundles: '++id, plan_id, imported_at, valid_from, valid_to',
      meta: '&key',
    });
    // v2 (SPEC-logging.md): log entries and saved foods. No log data existed before v2,
    // so there is nothing to transform; v1 plans and meta pass through untouched.
    this.version(2).stores({
      logs: '&id, date, updated_at',
      foods: '&id, name, last_used_at',
    });
  }
}

export const db = new BetweenRoundsDB();

/**
 * Store a validated bundle and make it the active plan.
 * Earlier bundles stay in history (read-only) so past logs keep their targets.
 * Logs are never touched here.
 */
export async function importBundle(bundle: PlanBundle): Promise<StoredBundle> {
  const row: StoredBundle = {
    plan_id: bundle.plan_id,
    data_version: bundle.data_version,
    valid_from: bundle.valid_from,
    valid_to: bundle.valid_to,
    imported_at: new Date().toISOString(),
    bundle,
  };
  row.id = await db.bundles.add(row);
  return row;
}

/** The active plan is the most recently imported bundle. */
export async function getActiveBundle(): Promise<StoredBundle | undefined> {
  return db.bundles.orderBy('imported_at').last();
}

/**
 * The bundle whose targets apply to a given date: the most recently imported
 * bundle whose valid_from–valid_to covers that date.
 */
export async function getBundleForDate(date: string): Promise<StoredBundle | undefined> {
  const covering = await db.bundles.where('valid_from').belowOrEqual(date).filter((b) => b.valid_to >= date).toArray();
  covering.sort((a, b) => a.imported_at.localeCompare(b.imported_at));
  return covering.at(-1);
}

export async function listBundles(): Promise<StoredBundle[]> {
  return db.bundles.orderBy('imported_at').reverse().toArray();
}

/** Ask the browser not to evict our storage (important on iPad Safari). */
export async function requestPersistentStorage(): Promise<boolean | undefined> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage?.persist?.();
  } catch {
    return undefined;
  }
}
