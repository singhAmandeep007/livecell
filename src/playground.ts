import { page } from "./server.ts";
import { embed, type EmbedOptions } from "./embed.ts";

export interface PlaygroundOptions extends EmbedOptions {
  html?: string;
  css?: string;
  js?: string;
  /** Stack panes vertically instead of side by side. */
  vertical?: boolean;
}

/**
 * An editable HTML/CSS/JS playground with a live preview — the only way a notebook can
 * actually demonstrate layout behaviour (flexbox, grid, positioning).
 */
export function playground(opts: PlaygroundOptions = {}): void {
  const {
    html: markup = '<div class="box">edit me</div>',
    css = ".box { padding: 20px; background: #dbeafe; }",
    js = "",
    vertical = false,
    height = 420,
    ...rest
  } = opts;

  const enc = (s: string) => encodeURIComponent(s);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; font:13px ui-monospace,Menlo,monospace; }
    .wrap { display:flex; flex-direction:${vertical ? "column" : "row"}; height:100vh; }
    .panes { display:flex; flex-direction:column; flex:1; min-width:0; border-right:1px solid #e2e8f0; }
    .pane { display:flex; flex-direction:column; flex:1; min-height:0; }
    .pane label { background:#f1f5f9; padding:3px 8px; font:11px system-ui; color:#475569;
                  border-bottom:1px solid #e2e8f0; }
    textarea { flex:1; border:0; padding:8px; resize:none; font:12px ui-monospace,Menlo,monospace;
               outline:none; min-height:0; }
    iframe { flex:1.2; border:0; background:#fff; min-width:0; }
  </style></head><body>
    <div class="wrap">
      <div class="panes">
        <div class="pane"><label>HTML</label><textarea id="h"></textarea></div>
        <div class="pane"><label>CSS</label><textarea id="c"></textarea></div>
        ${js ? '<div class="pane"><label>JS</label><textarea id="j"></textarea></div>' : ""}
      </div>
      <iframe id="out"></iframe>
    </div>
    <script>
      const h = document.getElementById("h"), c = document.getElementById("c");
      const j = document.getElementById("j"), out = document.getElementById("out");
      h.value = decodeURIComponent("${enc(markup)}");
      c.value = decodeURIComponent("${enc(css)}");
      if (j) j.value = decodeURIComponent("${enc(js)}");
      const render = () => {
        out.srcdoc = "<style>" + c.value + "</style>" + h.value +
                     (j ? "<scr" + "ipt>" + j.value + "</scr" + "ipt>" : "");
      };
      [h, c, j].filter(Boolean).forEach((el) => el.addEventListener("input", render));
      render();
    </script>
  </body></html>`;
  embed(page(doc), { height, ...rest });
}
