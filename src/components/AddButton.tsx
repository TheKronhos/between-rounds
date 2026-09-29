import { useEntrySheet } from './EntrySheetContext';
import { IconPlus } from './Icons';

/** Always-visible "+ Add meal or snack" (SPEC-logging §2). Logs an unplanned entry. */
export function AddButton() {
  const open = useEntrySheet();
  return (
    <button className="fab no-print" onClick={() => open({ mode: 'add' })}>
      <IconPlus size={26} />
      <span>Add meal or snack</span>
    </button>
  );
}
