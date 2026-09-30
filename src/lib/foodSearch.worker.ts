/// <reference lib="webworker" />
// Builds the food-table search index off the main thread. Loads foods.json from the
// app's own files (precached by the service worker), never from USDA.

import { buildIndex, decode, searchFoodsDetailed, type FoodIndex, type FoodTableFile } from './foodTable';

type In = { type: 'init'; url: string } | { type: 'search'; id: number; q: string; limit?: number };

let index: FoodIndex | null = null;
let loading: Promise<void> | null = null;

async function init(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const file = (await res.json()) as FoodTableFile;
  index = buildIndex(decode(file));
  postMessage({ type: 'ready', count: index.foods.length });
}

self.onmessage = async (e: MessageEvent<In>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    loading ??= init(msg.url).catch((err) => {
      loading = null;
      postMessage({ type: 'error', message: String(err) });
    });
    return;
  }
  if (msg.type === 'search') {
    await loading;
    const r = index ? searchFoodsDetailed(index, msg.q, msg.limit) : { results: [], loose: false };
    postMessage({ type: 'results', id: msg.id, ...r });
  }
};
