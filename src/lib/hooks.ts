import { useLiveQuery } from 'dexie-react-hooks';
import { getActiveBundle } from './db';
import type { StoredBundle } from './types';

/**
 * The active plan. `undefined` while loading, `null` when no plan has been imported.
 */
export function useActivePlan(): StoredBundle | null | undefined {
  return useLiveQuery(async () => (await getActiveBundle()) ?? null, []);
}
