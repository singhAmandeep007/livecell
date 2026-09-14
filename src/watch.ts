import { broadcastReload, state } from "./server.ts";

/**
 * Watch a directory and push a reload to every embedded page when files change.
 * Debounced, because editors emit bursts of events per save.
 */
export function watch(dir: string, opts: { debounceMs?: number } = {}): () => void {
  const { debounceMs = 120 } = opts;
  const existing = state.watchers.get(dir);
  if (existing) return () => existing.close();

  const watcher = Deno.watchFs(dir, { recursive: true });
  let timer: ReturnType<typeof setTimeout> | undefined;

  (async () => {
    for await (const _ev of watcher) {
      clearTimeout(timer);
      timer = setTimeout(broadcastReload, debounceMs);
    }
  })().catch(() => {/* watcher closed */});

  const handle = { close: () => watcher.close() };
  state.watchers.set(dir, handle);
  return () => {
    handle.close();
    state.watchers.delete(dir);
  };
}
