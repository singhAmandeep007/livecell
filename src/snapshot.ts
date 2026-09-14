/**
 * Optional PNG fallback so embeds still show something on GitHub, where the local
 * server does not exist.
 *
 * Uses `@astral/astral`, which downloads a headless Chromium on first use. It is imported
 * lazily so the rest of livecell has no browser dependency.
 */
export interface SnapshotOptions {
  width?: number;
  height?: number;
  /** Wait this long for the page to settle before capturing. */
  waitMs?: number;
}

/** Capture `url` to `outPath` (PNG). Returns the path, or null if unavailable. */
export async function snapshot(
  url: string,
  outPath: string,
  opts: SnapshotOptions = {},
): Promise<string | null> {
  const { width = 1000, height = 620, waitMs = 1200 } = opts;
  try {
    // Lazily imported with an explicit specifier, NOT a bare one: this is an optional
    // dependency, and a consumer of the published package has no import map entry for it.
    // deno-lint-ignore no-import-prefix
    const { launch } = await import("jsr:@astral/astral@^0.4");
    const browser = await launch({ headless: true });
    const page = await browser.newPage(url);
    await page.setViewportSize({ width, height });
    await new Promise((r) => setTimeout(r, waitMs));
    const buf = await page.screenshot();
    await browser.close();
    await Deno.mkdir(outPath.replace(/\/[^/]+$/, ""), { recursive: true }).catch(() => {});
    await Deno.writeFile(outPath, buf);
    return outPath;
  } catch (e) {
    console.log(
      `[livecell] snapshot unavailable (${e instanceof Error ? e.message : e}).\n` +
        `           Install a headless browser or pass { snapshot: false }.`,
    );
    return null;
  }
}
