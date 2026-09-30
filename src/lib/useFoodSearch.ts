import { useEffect, useState } from 'react';
import type { FoodHit } from './foodTable';

// One shared search worker for the whole app. Started once (on first use, or when the
// app goes idle after launch) so the index is ready before the first search.

type Status = 'loading' | 'ready' | 'error';
let worker: Worker | null = null;
let status: Status = 'loading';
let nextId = 1;
type Reply = { results: FoodHit[]; loose: boolean };
const pending = new Map<number, (r: Reply) => void>();
const statusListeners = new Set<(s: Status) => void>();

function setStatus(s: Status) {
  status = s;
  statusListeners.forEach((l) => l(s));
}

export function startFoodSearch() {
  if (worker) return;
  worker = new Worker(new URL('./foodSearch.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ready') setStatus('ready');
    else if (m.type === 'error') setStatus('error');
    else if (m.type === 'results') {
      pending.get(m.id)?.({ results: m.results, loose: m.loose });
      pending.delete(m.id);
    }
  };
  worker.onerror = () => setStatus('error');
  // Resolve against the page (not the worker bundle) so it works under /between-rounds/.
  worker.postMessage({ type: 'init', url: new URL('foods.json', document.baseURI).href });
}

function search(q: string): Promise<Reply> {
  startFoodSearch();
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ type: 'search', id, q });
  });
}

/** Food-table matches for the current text. Ignores stale replies while typing. */
export function useFoodSearch(q: string): { status: Status } & Reply {
  const [st, setSt] = useState<Status>(status);
  const [reply, setReply] = useState<Reply>({ results: [], loose: false });

  useEffect(() => {
    startFoodSearch();
    statusListeners.add(setSt);
    setSt(status);
    return () => void statusListeners.delete(setSt);
  }, []);

  useEffect(() => {
    let live = true;
    if (q.trim().length < 2) {
      setReply({ results: [], loose: false });
      return;
    }
    search(q).then((r) => live && setReply(r));
    return () => {
      live = false;
    };
  }, [q, st]);

  return { status: st, ...reply };
}
