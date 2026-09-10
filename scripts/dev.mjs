/**
 * Local development: keeps public/data fresh while `next dev` runs, so the
 * dashboard behaves locally the way the scheduled refresh makes it behave in
 * production.
 */
import { spawn } from "node:child_process";

const REFRESH_MS = 2 * 60_000;

const run = (command) => spawn(command, { stdio: "inherit", shell: true });

const refreshData = () =>
  new Promise((resolve) => run("npm run --silent data").on("exit", resolve));

await refreshData();

const next = run("npx next dev");

let refreshing = false;
const timer = setInterval(async () => {
  if (refreshing) return;
  refreshing = true;
  await refreshData();
  refreshing = false;
}, REFRESH_MS);

next.on("exit", (code) => {
  clearInterval(timer);
  process.exit(code ?? 0);
});
