// Proves this copy of modern-web-guidance has no telemetry and still works offline.
// Run from anywhere: node .agents/skills/modern-web-guidance/check-no-telemetry.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const cli = join(dir, "modern-web.mjs");
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// 1. No uploader and no telemetry code left in any shipped script.
check(!existsSync(join(dir, "watchdog")), "watchdog/ uploader is present");
const banned = ["play.googleapis.com/log", "WatchdogClient", "watchdog/main.js", "clearcutEndpoint"];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".mjs") && f !== "check-no-telemetry.mjs")) {
  const text = readFileSync(join(dir, file), "utf8");
  for (const word of banned) check(!text.includes(word), `${file} still contains ${word}`);
}
check(!readFileSync(join(dir, "SKILL.md"), "utf8").includes("@latest"), "SKILL.md still runs the npm build");

// 2. The tool works with every network call and child process blocked.
// The preload makes any socket or spawned process throw, so a hidden call would fail the run.
const preload = `data:text/javascript,${encodeURIComponent(`
import net from "node:net"; import cp from "node:child_process"; import { syncBuiltinESMExports } from "node:module";
const block = (what) => () => { throw new Error("BLOCKED " + what); };
net.connect = net.createConnection = net.Socket.prototype.connect = block("network");
cp.spawn = cp.spawnSync = cp.exec = cp.execFile = cp.fork = block("child process");
globalThis.fetch = block("fetch");
syncBuiltinESMExports();`)}`;
const run = (...args) => spawnSync(process.execPath, ["--import", preload, cli, ...args], {
  encoding: "utf8", env: { ...process.env, DISABLE_TELEMETRY: "" },
});

const search = run("search", "light dismiss dialog");
check(search.status === 0 && search.stdout.includes('"id"'), `search failed: ${search.stderr}`);
check(!/BLOCKED/.test(search.stderr), `search tried to reach out: ${search.stderr}`);
const firstId = search.status === 0 ? JSON.parse(search.stdout)[0]?.id : null;
if (firstId) {
  const retrieve = run("retrieve", firstId);
  check(retrieve.status === 0 && !/BLOCKED/.test(retrieve.stderr), `retrieve failed: ${retrieve.stderr}`);
}
const update = run("update");
check(update.status === 1 && /telemetry removed/.test(update.stderr), "update is not blocked");

if (failures.length) {
  console.error("FAIL\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("ok: no telemetry, search and retrieve work offline, update is blocked");
