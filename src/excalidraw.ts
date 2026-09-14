import { page } from "./server.ts";
import { embed, type EmbedOptions } from "./embed.ts";

export interface ExcalidrawOptions extends EmbedOptions {
  /** Allow editing in the cell. Default false (view-only). */
  editable?: boolean;
  /** When editing a file, write changes back to it via the Save button. */
  save?: boolean;
}

const EXCALIDRAW_VERSION = "0.17.6";

/**
 * Render an Excalidraw scene — a path to a `.excalidraw.json` file, or the scene object.
 * With `{ editable: true, save: true }` the cell becomes a full editor that writes back.
 */
export async function excalidraw(
  scene: string | Record<string, unknown>,
  opts: ExcalidrawOptions = {},
): Promise<void> {
  const { editable = false, save = false, height = 480, ...rest } = opts;
  const file = typeof scene === "string" ? scene : "";
  const data = typeof scene === "string" ? JSON.parse(await Deno.readTextFile(scene)) : scene;

  const payload = encodeURIComponent(JSON.stringify({
    elements: (data as { elements?: unknown[] }).elements ?? [],
    appState: { viewBackgroundColor: "#ffffff" },
  }));

  const saveBar = save && file
    ? `<div style="position:fixed;top:8px;right:8px;z-index:10">
         <button id="save" style="font:13px system-ui;padding:6px 12px;border-radius:6px;
           border:1px solid #7c3aed;background:#7c3aed;color:#fff;cursor:pointer">Save</button>
         <span id="status" style="font:12px system-ui;margin-left:8px;color:#475569"></span>
       </div>`
    : "";

  const saveScript = save && file
    ? `document.getElementById("save").onclick = async () => {
         const st = document.getElementById("status");
         st.textContent = "saving…";
         const scene = { type:"excalidraw", version:2,
           source:"livecell",
           elements: api.getSceneElements(),
           appState: { viewBackgroundColor: "#ffffff" }, files: {} };
         const r = await fetch("/__save", { method:"POST",
           headers:{"content-type":"application/json"},
           body: JSON.stringify({ file: ${JSON.stringify(file)}, scene }) });
         const j = await r.json();
         st.textContent = j.ok ? "saved ✓" : ("error: " + j.error);
       };`
    : "";

  const doc = [
    '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">',
    saveBar,
    '<div id="root" style="height:100vh"></div>',
    `<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>`,
    `<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>`,
    `<script src="https://unpkg.com/@excalidraw/excalidraw@${EXCALIDRAW_VERSION}/dist/excalidraw.production.min.js"></script>`,
    "<script>",
    `  const data = JSON.parse(decodeURIComponent("${payload}"));`,
    "  let api = null;",
    "  ReactDOM.createRoot(document.getElementById('root')).render(",
    "    React.createElement(ExcalidrawLib.Excalidraw, {",
    "      initialData: data,",
    `      viewModeEnabled: ${editable ? "false" : "true"},`,
    "      excalidrawAPI: (a) => { api = a; },",
    "    }));",
    saveScript,
    "</script></body></html>",
  ].join("\n");

  embed(page(doc), { height, ...rest });
}
