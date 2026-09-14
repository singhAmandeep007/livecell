/**
 * The local HTTP server: static mounts, generated pages, live-reload and log collection.
 *
 * Everything is served from localhost rather than an iframe `srcdoc`, because VS Code
 * applies a Content-Security-Policy to notebook output that blocks external <script>
 * tags. A document loaded via `src=http://localhost:…` is a separate origin with no
 * such policy, so CDN scripts, ES modules and dev servers all work normally.
 */

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  map: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  csv: "text/csv",
  txt: "text/plain",
  wasm: "application/wasm",
};

export const mimeOf = (p: string): string =>
  MIME[p.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

export interface LogEntry {
  level: string;
  args: string;
  at: number;
}

interface State {
  server: Deno.HttpServer | null;
  port: number;
  mounts: Map<string, string>;
  pages: Map<string, string>;
  logs: LogEntry[];
  reloadClients: Set<ReadableStreamDefaultController<Uint8Array>>;
  watchers: Map<string, { close: () => void }>;
  procs: Deno.ChildProcess[];
}

// Survives cell re-runs within one kernel session.
// deno-lint-ignore no-explicit-any
const g = globalThis as any;
g.__livecell ??= {
  server: null,
  port: 0,
  mounts: new Map(),
  pages: new Map(),
  logs: [],
  reloadClients: new Set(),
  watchers: new Map(),
  procs: [],
} satisfies State;

export const state: State = g.__livecell;

export const origin = (): string => `http://localhost:${state.port}`;

/** Start the server (idempotent). Scans for a free port. */
export function start(preferredPort = 8900): number {
  if (state.server) return state.port;
  let lastErr: unknown;
  for (let p = preferredPort; p < preferredPort + 64; p++) {
    try {
      state.server = Deno.serve({ port: p, onListen: () => {} }, handler);
      state.port = p;
      return p;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`livecell: no free port in ${preferredPort}..${preferredPort + 64}: ${lastErr}`);
}

/** Serve a directory at /m/<name>/ */
export function mountDir(name: string, dir: string): string {
  state.mounts.set(name, dir.replace(/\/+$/, ""));
  start();
  return `${origin()}/m/${name}/`;
}

/** Register a generated HTML page, returning its URL. */
export function addPage(markup: string): string {
  const id = crypto.randomUUID().slice(0, 8);
  state.pages.set(id, markup);
  start();
  return `${origin()}/p/${id}`;
}

/** Tell every connected page to reload. */
export function broadcastReload(): void {
  const msg = new TextEncoder().encode("data: reload\n\n");
  for (const c of state.reloadClients) {
    try {
      c.enqueue(msg);
    } catch {
      state.reloadClients.delete(c);
    }
  }
}

const CORS = { "access-control-allow-origin": "*" };

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = decodeURIComponent(url.pathname);

  // live-reload stream
  if (path === "/__reload") {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        state.reloadClients.add(controller);
      },
      cancel() {/* client gone */},
    });
    return new Response(body, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache", ...CORS },
    });
  }

  // console piping from embedded pages
  if (path === "/__log" && req.method === "POST") {
    try {
      const entry = await req.json() as LogEntry;
      state.logs.push({ ...entry, at: Date.now() });
      if (state.logs.length > 500) state.logs.shift();
    } catch { /* ignore malformed */ }
    return new Response("ok", { headers: CORS });
  }

  // save an edited Excalidraw scene back to disk
  if (path === "/__save" && req.method === "POST") {
    try {
      const { file, scene } = await req.json() as { file: string; scene: unknown };
      if (!state.mounts.has("__save_allow") && !file) throw new Error("no file");
      await Deno.writeTextFile(file, JSON.stringify(scene, null, 2));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json", ...CORS },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: String(e) }), {
        status: 400,
        headers: { "content-type": "application/json", ...CORS },
      });
    }
  }

  if (path.startsWith("/p/")) {
    const markup = state.pages.get(path.slice(3));
    return markup
      ? new Response(markup, { headers: { "content-type": "text/html; charset=utf-8", ...CORS } })
      : new Response("livecell: no such page", { status: 404, headers: CORS });
  }

  if (path.startsWith("/m/")) {
    const [, , name, ...rest] = path.split("/");
    const dir = state.mounts.get(name);
    if (!dir) return new Response(`livecell: no mount "${name}"`, { status: 404, headers: CORS });
    let rel = rest.join("/") || "index.html";
    if (rel.endsWith("/")) rel += "index.html";
    // refuse path traversal out of the mount
    const full = `${dir}/${rel}`;
    if (!full.startsWith(dir)) return new Response("forbidden", { status: 403, headers: CORS });
    try {
      const data = await Deno.readFile(full);
      const ct = mimeOf(rel);
      // inject the reload + console bridge into served HTML
      if (ct === "text/html") {
        const injected = new TextDecoder().decode(data).replace(
          /<\/body>/i,
          `<script src="/__bridge.js"></script></body>`,
        );
        return new Response(injected, { headers: { "content-type": ct, ...CORS } });
      }
      return new Response(data, { headers: { "content-type": ct, ...CORS } });
    } catch {
      return new Response(`livecell: not found ${rel}`, { status: 404, headers: CORS });
    }
  }

  if (path === "/__bridge.js") {
    return new Response(BRIDGE, { headers: { "content-type": "text/javascript", ...CORS } });
  }

  return new Response("livecell", { headers: CORS });
}

/** Injected into served HTML: live-reload listener + console forwarding. */
const BRIDGE = `
(() => {
  try {
    const es = new EventSource("/__reload");
    es.onmessage = (e) => { if (e.data === "reload") location.reload(); };
  } catch {}
  for (const level of ["log", "warn", "error", "info"]) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      try {
        fetch("/__log", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            level,
            args: args.map((a) => { try { return typeof a === "string" ? a : JSON.stringify(a); } catch { return String(a); } }).join(" "),
          }),
        });
      } catch {}
    };
  }
  window.addEventListener("error", (e) => {
    try {
      fetch("/__log", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ level: "error", args: e.message }) });
    } catch {}
  });
})();
`;

/** Stop the server, watchers and every spawned process. */
export async function stopAll(): Promise<string> {
  for (const p of state.procs) {
    try {
      p.kill("SIGTERM");
    } catch { /* already gone */ }
  }
  state.procs.length = 0;
  for (const w of state.watchers.values()) {
    try {
      w.close();
    } catch { /* ignore */ }
  }
  state.watchers.clear();
  state.reloadClients.clear();
  if (state.server) {
    await state.server.shutdown();
    state.server = null;
    state.port = 0;
  }
  return "livecell: stopped";
}
