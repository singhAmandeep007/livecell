/**
 * # livecell
 *
 * Live, runnable, media-rich cells for Deno Jupyter notebooks in VS Code.
 *
 * Embed a real project, a dev server, a diagram or an editable playground *underneath the
 * notes that explain it* — so a concept and the thing it describes live in one file.
 *
 * ```ts
 * import * as live from "jsr:@livecell/livecell";
 *
 * live.mount("app", "/abs/path/to/project");     // serve a folder
 * live.embed("/m/app/index.html", { height: 480 });
 *
 * live.mermaid("flowchart LR\n A --> B");         // diagrams that actually render
 * await live.excalidraw("./diagram.excalidraw.json", { editable: true, save: true });
 * live.playground({ css: ".box{display:flex}" }); // editable live preview
 *
 * const url = await live.serveCmd("npm", ["run", "dev"], 5173, { cwd: dir });
 * live.embed(url, { height: 600, console: true });
 *
 * await live.stopAll();                           // tidy up
 * ```
 *
 * **Why localhost and not `srcdoc`:** VS Code applies a Content-Security-Policy to notebook
 * output that blocks external `<script>` tags. A page loaded via `src=http://localhost:…` is
 * a separate origin with no such policy, so CDN scripts, ES modules and dev servers all work.
 *
 * @module
 */

export {
  addPage as addPageForTest,
  mountDir as mount,
  origin,
  start,
  state,
  stopAll,
} from "./server.ts";
export { clearLogs, embed, type EmbedOptions, logs, showLogs } from "./embed.ts";
export { mermaid } from "./mermaid.ts";
export { excalidraw, type ExcalidrawOptions } from "./excalidraw.ts";
export { playground, type PlaygroundOptions } from "./playground.ts";
export { watch } from "./watch.ts";
export { snapshot, type SnapshotOptions } from "./snapshot.ts";
export { escapeHtml, html, inKernel } from "./jupyter.ts";
export { serveCmd, type ServeCmdOptions } from "./process.ts";
