/**
 * Display helpers.
 *
 * `Deno.jupyter` THROWS when not running under `deno jupyter` — it is not merely
 * undefined — so every access must be wrapped.
 */

/** True when running inside the Deno Jupyter kernel. */
export function inKernel(): boolean {
  try {
    return typeof (Deno as unknown as { jupyter?: unknown }).jupyter !== "undefined";
  } catch {
    return false;
  }
}

/** Emit raw HTML as cell output. Outside the kernel, logs a summary instead. */
export function html(markup: string): void {
  try {
    // deno-lint-ignore no-explicit-any
    const j = (Deno as any).jupyter;
    if (j?.display) {
      j.display({ "text/html": markup }, { raw: true });
      return;
    }
  } catch {
    // not under the kernel
  }
  console.log(`[livecell] html output (${markup.length} chars) — not running in a kernel`);
}

/** Escape text for safe interpolation into HTML. */
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
