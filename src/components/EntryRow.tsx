import { num, time12 } from '../lib/format';
import { SOURCE_LABEL, entryTitle, statusLabel } from '../lib/log';
import type { LogEntry } from '../lib/types';
import { useEntrySheet } from './EntrySheetContext';
import { IconChevron } from './Icons';

/** A logged entry. Tap to edit or delete. */
export function EntryRow({ entry }: { entry: LogEntry }) {
  const open = useEntrySheet();
  const sources = [...new Set(entry.items.map((i) => SOURCE_LABEL[i.source]))].join(', ');
  return (
    <button className="entry-row" onClick={() => open({ mode: 'edit', entry })}>
      <span className="entry-main">
        <span className="meal-when">
          {time12(entry.time)} · {entry.kind === 'planned' ? `${entry.planned_ref?.slot} · ${statusLabel(entry)}` : statusLabel(entry)}
        </span>
        <span className="entry-title">{entry.status === 'skipped' ? `Skipped ${entry.planned_ref?.slot ?? ''}` : entryTitle(entry)}</span>
        {entry.status !== 'skipped' && (
          <span className="meal-macros">
            {num(entry.totals.kcal)} kcal · {num(entry.totals.protein_g)} g protein
            {sources && <span className="faint"> · {sources}</span>}
          </span>
        )}
        {entry.needs_refine && <span className="chip chip-outline tiny">To refine</span>}
      </span>
      <IconChevron />
    </button>
  );
}
