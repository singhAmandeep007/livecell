import { state } from "./server.ts";

export interface ServeCmdOptions {
  cwd?: string;
  /** Give up after this long. Default 30s (dev servers can be slow to boot). */
  timeoutMs?: number;
  /** Path to poll for readiness. Default "/". */
  path?: string;
  env?: Record<string, string>;
  /** Surface the process's stderr if it dies before the port opens. */
  verbose?: boolean;
}

/**
 * Spawn any server — node, go, python, npm, cargo — wait until its port actually answers,
 * and return the URL. The process is tracked and killed by `stopAll()`.
 */
export async function serveCmd(
  cmd: string,
  args: string[],
  port: number,
  opts: ServeCmdOptions = {},
): Promise<string> {
  const { cwd, timeoutMs = 30_000, path = "/", env, verbose = false } = opts;

  const child = new Deno.Command(cmd, {
    args,
    cwd,
    env,
    stdout: "null",
    stderr: verbose ? "piped" : "null",
  }).spawn();
  state.procs.push(child);

  const url = `http://localhost:${port}${path}`;
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";

  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) });
      return url;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  try {
    child.kill("SIGTERM");
  } catch { /* already gone */ }
  throw new Error(
    `livecell: \`${cmd} ${args.join(" ")}\` did not answer on :${port} within ${timeoutMs}ms` +
      (lastErr ? ` (last error: ${lastErr})` : ""),
  );
}
