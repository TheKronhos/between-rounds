import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { LogEntry, PlannedMeal, Recipe } from '../lib/types';
import { FoodEntrySheet } from './FoodEntrySheet';

export type SheetRequest =
  | { mode: 'add' }
  | { mode: 'replace'; date: string; meal: PlannedMeal; recipe: Recipe | undefined }
  | { mode: 'edit'; entry: LogEntry };

const Ctx = createContext<(req: SheetRequest) => void>(() => {});

/** Opens the Food Entry sheet from anywhere (the + button, meal cards, the Log list). */
export const useEntrySheet = () => useContext(Ctx);

export function EntrySheetProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<SheetRequest | null>(null);
  const [n, setN] = useState(0);
  const open = useCallback((r: SheetRequest) => {
    setN((x) => x + 1);
    setReq(r);
  }, []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {req && <FoodEntrySheet key={n} request={req} onClose={() => setReq(null)} />}
    </Ctx.Provider>
  );
}
