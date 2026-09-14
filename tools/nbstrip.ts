/**
 * git clean-filter: blank notebook outputs and execution counts before staging,
 * so running a notebook doesn't produce a giant unreadable diff.
 *
 * Enable once per clone:  deno task setup
 */
const input = new Uint8Array(await new Response(Deno.stdin.readable).arrayBuffer());
const text = new TextDecoder().decode(input);

try {
  const nb = JSON.parse(text);
  for (const cell of nb.cells ?? []) {
    if (cell.cell_type === "code") {
      cell.outputs = [];
      cell.execution_count = null;
    }
    // transient per-run metadata churns diffs for no benefit
    if (cell.metadata) delete cell.metadata.execution;
  }
  await Deno.stdout.write(new TextEncoder().encode(JSON.stringify(nb, null, 1) + "\n"));
} catch {
  // not valid JSON — pass through untouched rather than corrupting the file
  await Deno.stdout.write(input);
}
