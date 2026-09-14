import { page } from "./server.ts";
import { escapeHtml } from "./jupyter.ts";
import { embed, type EmbedOptions } from "./embed.ts";

/**
 * Render a Mermaid diagram.
 *
 * Notebook markdown cells do NOT render mermaid, and VS Code's CSP blocks CDN scripts in
 * `srcdoc`. Serving the page from localhost sidesteps both.
 */
export function mermaid(code: string, opts: EmbedOptions & { theme?: string } = {}): void {
  const { theme = "default", height = 320, ...rest } = opts;
  const url = page(
    `<!doctype html><html><head><meta charset="utf-8"></head>` +
      `<body style="margin:0;font:14px system-ui">` +
      `<pre class="mermaid">${escapeHtml(code)}</pre>` +
      `<script type="module">` +
      `import m from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";` +
      `m.initialize({ startOnLoad: true, theme: ${JSON.stringify(theme)} });` +
      `</script></body></html>`,
  );
  embed(url, { height, ...rest });
}
