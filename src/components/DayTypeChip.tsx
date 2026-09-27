import type { Targets } from '../lib/types';
import { IconDumbbell } from './Icons';

const KNOWN = ['hard', 'moderate', 'recovery'];

export function DayTypeChip({ dayType, targets }: { dayType: string; targets: Targets }) {
  const label = targets.day_types[dayType]?.label ?? dayType;
  const cls = KNOWN.includes(dayType) ? `chip chip-dt-${dayType}` : 'chip';
  return <span className={cls}>{label}</span>;
}

export function TrainingChip() {
  return (
    <span className="chip chip-outline">
      <IconDumbbell /> Training
    </span>
  );
}
