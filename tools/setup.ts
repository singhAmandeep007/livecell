/** One-time local setup for contributors: enable the notebook strip filter. */
const root = new URL("..", import.meta.url).pathname;
const run = (args: string[]) =>
  new Deno.Command("git", { args, cwd: root, stdout: "inherit", stderr: "inherit" }).output();

await run(["config", "filter.nbstrip.clean", `deno run -q --allow-read ${root}tools/nbstrip.ts`]);
await run(["config", "filter.nbstrip.smudge", "cat"]);
console.log("✓ notebook strip filter enabled — outputs will be stripped on `git add`");
