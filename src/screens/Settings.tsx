import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ChangeEvent } from 'react';
import { importBundle, listBundles } from '../lib/db';
import { dateRange, timestamp } from '../lib/format';
import sampleBundle from '../lib/sample-bundle.json';
import type { PlanBundle, StoredBundle } from '../lib/types';
import { parseAndValidate, validateBundle, type ValidationResult } from '../lib/validate';

type Pending = { result: ValidationResult; source: string };

export function SettingsScreen() {
  const bundles = useLiveQuery(listBundles, []);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pasted, setPasted] = useState('');
  const [imported, setImported] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = bundles?.[0];
  const history = bundles?.slice(1) ?? [];

  const check = (result: ValidationResult, source: string) => {
    setImported(null);
    setPending({ result, source });
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    check(parseAndValidate(await file.text()), `file "${file.name}"`);
  };

  const confirmImport = async () => {
    if (!pending?.result.bundle) return;
    setBusy(true);
    try {
      const row = await importBundle(pending.result.bundle);
      setImported(row.plan_id);
      setPending(null);
      setPasted('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <h2 className="section-title">Current plan</h2>
      {active ? <PlanSummary stored={active} /> : <div className="card muted">No plan imported yet.</div>}

      <h2 className="section-title">Import a plan</h2>
      <div className="card stack">
        <p className="muted small">
          A new plan replaces the current one. Your logs are never deleted, and older plans are kept below.
        </p>
        <div className="btn-row">
          <label className="btn btn-primary file-btn">
            Choose plan file…
            <input type="file" accept=".json,application/json,text/plain" onChange={onFile} />
          </label>
          <button className="btn" onClick={() => check(validateBundle(sampleBundle), 'sample plan')}>
            Load sample plan
          </button>
        </div>
        <label className="field">
          <span>Or paste the plan JSON</span>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder='{ "bundle_type": "nutrition_plan", … }'
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <div className="btn-row">
          <button className="btn" disabled={!pasted.trim()} onClick={() => check(parseAndValidate(pasted), 'pasted text')}>
            Check pasted plan
          </button>
        </div>
      </div>

      {pending && (
        <div style={{ marginTop: 16 }}>
          <ImportReview
            pending={pending}
            active={active}
            busy={busy}
            onConfirm={confirmImport}
            onCancel={() => setPending(null)}
          />
        </div>
      )}
      {imported && (
        <div className="done" style={{ marginTop: 16 }} role="status">
          Imported <strong>{imported}</strong>. It's now your active plan.
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2 className="section-title">Earlier plans</h2>
          <div className="card">
            <p className="muted small">Kept read-only so past logs still show the targets they were logged against.</p>
            <ul className="history" style={{ marginTop: 8 }}>
              {history.map((b) => (
                <li key={b.id}>
                  <div><strong>{b.plan_id}</strong> <span className="muted">· v{b.data_version}</span></div>
                  <div className="small muted">
                    {dateRange(b.valid_from, b.valid_to)} · imported {timestamp(b.imported_at)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

function counts(b: PlanBundle) {
  return [
    `${b.days.length} days`,
    `${b.recipes.length} recipes`,
    `${b.grocery.length} grocery items`,
    `${b.prep.length} prep sessions`,
    `${b.reminders.length} reminders`,
  ].join(' · ');
}

function PlanSummary({ stored }: { stored: StoredBundle }) {
  const b = stored.bundle;
  return (
    <div className="card">
      <dl className="facts">
        <dt>Plan</dt>
        <dd className="mono">{b.plan_id}</dd>
        <dt>Version</dt>
        <dd>{b.data_version}</dd>
        <dt>Dates</dt>
        <dd>{dateRange(b.valid_from, b.valid_to)}</dd>
        <dt>Imported</dt>
        <dd>{timestamp(stored.imported_at)}</dd>
      </dl>
      <p className="small muted" style={{ marginTop: 10 }}>{counts(b)}</p>
    </div>
  );
}

function ImportReview({
  pending,
  active,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: Pending;
  active: StoredBundle | undefined;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { result, source } = pending;

  if (!result.ok) {
    return (
      <div className="notice" role="alert">
        <h3>Not imported. Your current plan is unchanged.</h3>
        <p style={{ marginTop: 6 }}>
          The {source} has {result.errors.length} {result.errors.length === 1 ? 'problem' : 'problems'} to fix first:
        </p>
        <ul>
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
        {result.warnings.length > 0 && <Warnings warnings={result.warnings} />}
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onCancel}>Dismiss</button>
        </div>
      </div>
    );
  }

  const b = result.bundle!;
  const samePlan = active?.plan_id === b.plan_id;
  return (
    <div className="card stack" role="status">
      <h3>Checked. Ready to import.</h3>
      <dl className="facts">
        <dt>Plan</dt>
        <dd className="mono">{b.plan_id}</dd>
        <dt>Dates</dt>
        <dd>{dateRange(b.valid_from, b.valid_to)}</dd>
      </dl>
      <p className="small muted">{counts(b)}</p>
      {samePlan && <p className="small">This is a new version of your current plan and will replace it.</p>}
      {result.warnings.length > 0 && (
        <div className="notice">
          <Warnings warnings={result.warnings} />
        </div>
      )}
      <div className="btn-row">
        <button className="btn btn-primary" disabled={busy} onClick={onConfirm}>
          {active ? 'Import and replace current plan' : 'Import plan'}
        </button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  return (
    <>
      <p style={{ marginTop: 8 }}>
        <strong>Heads up</strong> ({warnings.length}). These don't block the import:
      </p>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </>
  );
}
