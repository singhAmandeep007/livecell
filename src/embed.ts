import { addPage, origin, start, state } from "./server.ts";
import { escapeHtml, html } from "./jupyter.ts";

export interface EmbedOptions {
  /** iframe height in px. Default 460. */
  height?: number;
  /** Caption shown above the frame. */
  label?: string;
  /**
   * Also write a PNG next to the notebook and reference it, so the output still shows
   * something on GitHub / for anyone without the server running. Requires a headless
   * browser (see `snapshot.ts`).
   */
  snapshot?: string | false;
  /** Extra sandbox tokens. Defaults allow scripts, same-origin, forms, popups, modals. */
  sandbox?: string;
}

const DEFAULT_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals";

/** Resolve a mount path or absolute URL to a full URL. */
export function resolveUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  start();
  return `${origin()}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** Build the iframe markup (exported for testing). */
export function frameMarkup(src: string, opts: EmbedOptions = {}): string {
  const { height = 460, label, sandbox = DEFAULT_SANDBOX } = opts;
  const caption = label
    ? `<div style="font:13px system-ui;margin:0 0 6px;color:#475569">${escapeHtml(label)} — <code>${
      escapeHtml(src)
    }</code></div>`
    : "";
  return `${caption}<iframe src="${
    escapeHtml(src)
  }" width="100%" height="${height}" loading="lazy"` +
    ` style="border:1px solid #cbd5e1;border-radius:8px;background:#fff"` +
    ` sandbox="${sandbox}"></iframe>`;
}

/** Embed a running page as cell output. */
export function embed(pathOrUrl: string, opts: EmbedOptions = {}): void {
  html(frameMarkup(resolveUrl(pathOrUrl), opts));
}

/** Console output collected from embedded pages (newest last). */
export function logs(limit = 50): string[] {
  return state.logs.slice(-limit).map((l) => `[${l.level}] ${l.args}`);
}

/** Clear collected console output. */
export function clearLogs(): void {
  state.logs.length = 0;
}

/** Render collected console output as a styled block in the cell. */
export function showLogs(limit = 50): void {
  const rows = logs(limit);
  const body = rows.length
    ? rows.map((r) => `<div>${escapeHtml(r)}</div>`).join("")
    : `<div style="color:#94a3b8">no console output captured yet</div>`;
  html(
    `<div style="font:12px ui-monospace,Menlo,monospace;background:#0f172a;color:#e2e8f0;` +
      `padding:10px;border-radius:8px;max-height:260px;overflow:auto">${body}</div>`,
  );
}

export { addPage };
