# livecell

**Live, runnable, media-rich cells for Deno Jupyter notebooks in VS Code.**

Put a real project, a dev server, a diagram or an editable playground **directly underneath the
notes that explain it** — so the concept and the thing it describes live in the same file.

```ts
import * as live from "jsr:@livecell/livecell";

live.mount("app", "/abs/path/to/project");
live.embed("/m/app/index.html", { height: 480 }); // ← the real app, running, in the cell
```

## Why this exists

Notebooks are great at _narrative + runnable code_, and useless at showing anything visual. A Deno
cell can compute, but it can't render a CSS layout, a DOM interaction or a React component.
`livecell` closes that gap: anything that runs on a port can be embedded next to its explanation.

**The trick:** VS Code applies a Content-Security-Policy to notebook output that blocks external
`<script>` tags, so an iframe `srcdoc` can't load Mermaid, Excalidraw or any CDN library. A page
loaded via `src=http://localhost:…` is a **separate origin with no such policy** — so scripts, ES
modules and dev servers all work normally. `livecell` runs a small local server and serves
everything through it.

## Setup on a new machine

```bash
# 1. Deno (if you don't have it)
curl -fsSL https://deno.land/install.sh | sh

# 2. Register the Deno Jupyter kernel
deno jupyter --install

# 3. In VS Code: install the Jupyter extension, open a .ipynb, pick the "Deno" kernel
```

That's it — there is nothing to install for `livecell` itself. Import it by URL in a cell.

## What you get

| Function                          | Does                                                                   |
| --------------------------------- | ---------------------------------------------------------------------- |
| `mount(name, dir)`                | serve a folder at `/m/<name>/`                                         |
| `embed(path, opts)`               | render it as an iframe in the cell                                     |
| `serveCmd(cmd, args, port, opts)` | spawn **any** server (node/go/python/npm), wait for the port, embed it |
| `mermaid(code)`                   | Mermaid diagrams — which notebook markdown cells **cannot** render     |
| `excalidraw(file, opts)`          | Excalidraw scenes, optionally **editable and saved back to disk**      |
| `playground({html, css, js})`     | editable code + live preview in one cell                               |
| `watch(dir)`                      | auto-reload embeds when files change                                   |
| `logs()` / `showLogs()`           | the embedded page's `console.log`, piped into cell output              |
| `snapshot(url, out)`              | PNG fallback so output isn't blank on GitHub                           |
| `stopAll()`                       | stop the server, watchers and every spawned process                    |

## Examples

```ts
// A framework dev server
const url = await live.serveCmd("npm", ["run", "dev"], 5173, { cwd: projectDir });
live.embed(url, { height: 600 });

// Go / Python are no different
await live.serveCmd("go", ["run", "."], 8080, { cwd });
await live.serveCmd("python3", ["-m", "http.server", "8000"], 8000, { cwd });

// A diagram you can edit in the cell and save back to the file
await live.excalidraw("./assets/architecture.excalidraw.json", { editable: true, save: true });

// Show how flexbox actually behaves, not a description of it
live.playground({
  html: `<div class="row"><div>a</div><div>b</div></div>`,
  css: `.row { display: flex; justify-content: space-between; }`,
});

// Edit the project while the notebook is open
live.mount("app", dir);
live.watch(dir); // embeds reload on save

// See what the page logged
live.showLogs();
```

## Design notes

- **Local-first.** Everything runs on your machine. Nothing is uploaded, no account, no service.
- **Session-stable.** State lives on `globalThis`, so re-running a cell reuses the same server and
  port instead of leaking one per run.
- **Ports are scanned**, starting at 8900, so a busy port doesn't break the notebook.
- **Mounts are sandboxed** — path traversal out of a mounted directory is refused (tested).
- **`Deno.jupyter` throws outside the kernel** (it isn't merely undefined), so every access is
  guarded; the same code runs under `deno run` for testing.

## Deno Jupyter kernel gotchas

Two things surprise everyone. Neither is livecell-specific, but you will hit both.

**1. `import.meta` does not exist.** The kernel evaluates each cell as a _script_, not a module, so
`import.meta.url` throws `SyntaxError: Cannot use 'import.meta' outside a module`. There is no
reliable "path of this notebook". Locate things from `Deno.cwd()` instead — and note the CWD depends
on VS Code's `jupyter.notebookFileRoot` setting:

```ts
function findUp(marker: string, from = Deno.cwd()): string {
  let dir = from;
  for (let i = 0; i < 8; i++) {
    try {
      Deno.statSync(`${dir}/${marker}`);
      return dir;
    } catch { /* keep walking */ }
    const parent = dir.replace(/\/[^/]+$/, "");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not find ${marker} above ${from}`);
}
var root = findUp("deno.json");
```

**2. Use `var` for bindings you might re-run.** Top-level `const`/`let` create lexical bindings in
the shared global scope, so re-running the same cell throws
`SyntaxError: Identifier 'x' has already been declared`. `var` is redeclarable, which is exactly
what you want in a notebook. For the same reason, avoid declaring the same name in two cells of one
notebook.

## Caveat worth knowing

Embeds are **live only on the machine running the notebook**. On GitHub, or for anyone who hasn't
run the cells, an iframe to `localhost` shows nothing. Use `snapshot: true` (or
`live.snapshot(...)`) to write a PNG fallback if the notebook needs to be readable elsewhere.

## Development

```bash
deno task test     # 14 tests, no network needed
deno task check    # type-check the public API
deno task lint
deno task fmt
```

## License

MIT
