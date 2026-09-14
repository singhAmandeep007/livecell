import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import * as live from "../src/mod.ts";
import { frameMarkup, resolveUrl } from "../src/embed.ts";
import { mimeOf } from "../src/server.ts";

const FIXTURE = await Deno.makeTempDir({ prefix: "livecell_fix_" });
await Deno.writeTextFile(`${FIXTURE}/index.html`, "<html><body><h1>fixture</h1></body></html>");
await Deno.writeTextFile(`${FIXTURE}/app.js`, "console.log('hi')");
await Deno.mkdir(`${FIXTURE}/sub`, { recursive: true });
await Deno.writeTextFile(`${FIXTURE}/sub/index.html`, "<html><body>sub</body></html>");

Deno.test("mimeOf maps common extensions", () => {
  assertEquals(mimeOf("a.html"), "text/html");
  assertEquals(mimeOf("a.js"), "text/javascript");
  assertEquals(mimeOf("a.css"), "text/css");
  assertEquals(mimeOf("a.png"), "image/png");
  assertEquals(mimeOf("a.unknown"), "application/octet-stream");
});

Deno.test("start() is idempotent and returns a live port", () => {
  const p1 = live.start();
  const p2 = live.start();
  assertEquals(p1, p2);
  assert(p1 > 0);
});

Deno.test("start() avoids a port already in use", async () => {
  await live.stopAll();
  const basePort = 8900;
  const blocker = Deno.serve({ port: basePort, onListen: () => {} }, () => new Response("busy"));
  try {
    const chosen = live.start(basePort);
    assert(chosen !== basePort, `collided on :${basePort}`);
    assert(chosen > basePort, "should scan upward for a free port");
  } finally {
    await live.stopAll();
    await blocker.shutdown();
  }
});

Deno.test("mount() serves files, directory indexes and 404s", async () => {
  live.mount("fix", FIXTURE);

  const root = await fetch(`${live.origin()}/m/fix/`);
  assertEquals(root.status, 200);
  assertStringIncludes(await root.text(), "fixture");

  const js = await fetch(`${live.origin()}/m/fix/app.js`);
  assertEquals(js.status, 200);
  assertEquals(js.headers.get("content-type"), "text/javascript");
  await js.text();

  const sub = await fetch(`${live.origin()}/m/fix/sub/`);
  assertEquals(sub.status, 200);
  assertStringIncludes(await sub.text(), "sub");

  const missing = await fetch(`${live.origin()}/m/fix/nope.txt`);
  assertEquals(missing.status, 404);
  await missing.text();

  const noMount = await fetch(`${live.origin()}/m/ghost/index.html`);
  assertEquals(noMount.status, 404);
  await noMount.text();
});

Deno.test("served HTML gets the bridge injected (reload + console)", async () => {
  live.mount("fix", FIXTURE);
  const res = await fetch(`${live.origin()}/m/fix/index.html`);
  const body = await res.text();
  assertStringIncludes(body, "__bridge.js");

  const bridge = await fetch(`${live.origin()}/__bridge.js`);
  assertEquals(bridge.status, 200);
  const js = await bridge.text();
  assertStringIncludes(js, "EventSource");
  assertStringIncludes(js, "__log");
});

Deno.test("console piping collects logs from pages", async () => {
  live.clearLogs();
  await (await fetch(`${live.origin()}/__log`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ level: "warn", args: "hello from the page" }),
  })).text();
  const got = live.logs();
  assertEquals(got.length, 1);
  assertStringIncludes(got[0], "[warn] hello from the page");
});

Deno.test("__save writes an edited scene back to disk", async () => {
  const target = `${FIXTURE}/scene.excalidraw.json`;
  const res = await fetch(`${live.origin()}/__save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file: target, scene: { type: "excalidraw", elements: [{ id: "a" }] } }),
  });
  assertEquals((await res.json()).ok, true);
  const written = JSON.parse(await Deno.readTextFile(target));
  assertEquals(written.elements[0].id, "a");
});

Deno.test("page() serves arbitrary HTML", async () => {
  const url = live.page("<h1>generated</h1>");
  const res = await fetch(url);
  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "generated");
});

Deno.test("frameMarkup escapes and honours options", () => {
  const m = frameMarkup("http://localhost:1/x", { height: 321, label: "a<b>" });
  assertStringIncludes(m, 'height="321"');
  assertStringIncludes(m, "a&lt;b&gt;");
  assertStringIncludes(m, "sandbox=");
});

Deno.test("resolveUrl passes through absolute URLs, prefixes relative ones", () => {
  assertEquals(resolveUrl("https://example.com/a"), "https://example.com/a");
  assertStringIncludes(resolveUrl("/m/fix/"), live.origin());
});

Deno.test("mermaid / playground / excalidraw each register a servable page", async () => {
  const before = new Set(live.state.pages.keys());

  live.mermaid("flowchart LR\n A --> B");
  live.playground({ css: ".x{color:red}" });
  await live.excalidraw({ elements: [{ id: "n1", type: "rectangle" }] });

  const added = [...live.state.pages.keys()].filter((k) => !before.has(k));
  assertEquals(added.length, 3, "each helper should register exactly one page");

  const bodies: string[] = [];
  for (const id of added) {
    const r = await fetch(`${live.origin()}/p/${id}`);
    assertEquals(r.status, 200);
    const body = await r.text();
    assert(body.length > 200, `page ${id} looks empty (${body.length} chars)`);
    bodies.push(body);
  }
  // each helper produced its own kind of page
  assert(bodies.some((b) => b.includes("mermaid")), "mermaid page missing");
  assert(bodies.some((b) => b.includes("textarea")), "playground page missing");
  assert(bodies.some((b) => b.includes("Excalidraw")), "excalidraw page missing");
});

Deno.test("serveCmd spawns a server, waits for the port, and returns the URL", async () => {
  const port = 8951;
  const url = await live.serveCmd(
    "deno",
    [
      "eval",
      `Deno.serve({port:${port}}, () => new Response("spawned-ok"));`,
    ],
    port,
    { timeoutMs: 15000 },
  );
  const res = await fetch(url);
  assertEquals(await res.text(), "spawned-ok");
});

Deno.test("serveCmd throws a clear error when the port never opens", async () => {
  let msg = "";
  try {
    await live.serveCmd("deno", ["eval", "await new Promise(()=>{})"], 8952, { timeoutMs: 1500 });
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  assertStringIncludes(msg, "did not answer on :8952");
});

Deno.test("mounts refuse path traversal", async () => {
  const secret = await Deno.makeTempFile({ prefix: "livecell_secret_" });
  await Deno.writeTextFile(secret, "SECRET-SHOULD-NOT-LEAK");
  live.mount("fix", FIXTURE);

  for (
    const attack of [
      `/m/fix/../../../..${secret}`,
      `/m/fix/..%2f..%2f..%2f..${secret.replaceAll("/", "%2f")}`,
      `/m/fix/....//....//${secret}`,
    ]
  ) {
    const res = await fetch(`${live.origin()}${attack}`);
    const body = await res.text();
    assert(!body.includes("SECRET-SHOULD-NOT-LEAK"), `traversal leaked via ${attack}`);
  }
  await Deno.remove(secret);
});

Deno.test("stopAll returns promptly even with an open live-reload stream", async () => {
  // Regression: server.shutdown() waits for in-flight requests, and an SSE stream never
  // finishes — so shutdown hung forever. Streams must be closed first.
  live.mount("fix", FIXTURE);
  const sse = await fetch(`${live.origin()}/__reload`);
  assertEquals(sse.headers.get("content-type"), "text/event-stream");

  const t0 = Date.now();
  await live.stopAll();
  const elapsed = Date.now() - t0;
  assert(elapsed < 3000, `stopAll took ${elapsed}ms — it is hanging again`);
  assertEquals(live.state.port, 0);
  await sse.body?.cancel().catch(() => {});
});

Deno.test("stopAll escalates to SIGKILL for a child that ignores SIGTERM", async () => {
  const port = 8953;
  await live.serveCmd(
    "deno",
    [
      "eval",
      `Deno.addSignalListener("SIGTERM", () => {});   // deliberately ignore it
     Deno.serve({ port: ${port} }, () => new Response("stubborn"));`,
    ],
    port,
    { timeoutMs: 15000 },
  );
  assertEquals(live.state.procs.length, 1);

  const t0 = Date.now();
  await live.stopAll({ graceMs: 600 });
  const elapsed = Date.now() - t0;

  assertEquals(live.state.procs.length, 0);
  assert(elapsed < 5000, `escalation took ${elapsed}ms`);

  // the port must actually be free again
  await new Promise((r) => setTimeout(r, 200));
  let stillUp = false;
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(500) });
    stillUp = true;
  } catch { /* expected: connection refused */ }
  assert(!stillUp, `process survived stopAll — :${port} still answering`);
});

Deno.test("status() reports what is running", async () => {
  live.mount("fix", FIXTURE);
  live.mermaid("flowchart LR\n A --> B");
  const st = live.status();
  assert(st.port > 0);
  assert(st.mounts.includes("fix"));
  assert(st.pages > 0);
  await live.stopAll();
  assertEquals(live.status().port, 0);
});

// Downloads a headless Chromium on first run. Skip with LIVECELL_SKIP_SNAPSHOT=1.
Deno.test({
  name: "snapshot() writes a real PNG of a served page",
  ignore: Deno.env.get("LIVECELL_SKIP_SNAPSHOT") === "1",
  async fn() {
    live.mount("fix", FIXTURE);
    const out = await Deno.makeTempFile({ suffix: ".png" });
    const written = await live.snapshot(`${live.origin()}/m/fix/index.html`, out, {
      width: 600,
      height: 300,
      waitMs: 400,
    });
    assert(written !== null, "snapshot returned null — headless browser unavailable");

    const bytes = await Deno.readFile(out);
    assert(bytes.length > 1000, `png suspiciously small: ${bytes.length} bytes`);
    // PNG magic number
    assertEquals([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

    await Deno.remove(out);
    await live.stopAll();
  },
});

Deno.test("stopAll releases generated pages but keeps mounts", async () => {
  live.mount("fix", FIXTURE);
  live.mermaid("flowchart LR\n A --> B");
  live.playground({ css: ".a{}" });
  assert(live.status().pages >= 2);

  await live.stopAll();
  assertEquals(live.status().pages, 0, "generated pages should not accumulate");
  assert(live.status().mounts.includes("fix"), "mounts are config and should survive");
});

Deno.test("stopAll shuts the server down and kills children", async () => {
  await live.stopAll();
  assertEquals(live.state.port, 0);
  assertEquals(live.state.procs.length, 0);
  await Deno.remove(FIXTURE, { recursive: true });
});
