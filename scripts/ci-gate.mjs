#!/usr/bin/env node
/**
 * Full institutional CI gate — build, trust tests, live standard check.
 * Run before deploy: npm run ci:gate
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const PORT = process.env.PORT ?? "3000";

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function waitForHealth(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const res = await fetch(`${APP_URL}/api/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await delay(2_000);
  }
  throw new Error(`Server did not become ready at ${APP_URL}`);
}

const serverEnv = {
  ...process.env,
  PORT,
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "ci-test-secret-min-32-chars-long",
  NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? APP_URL,
};

console.log("\n🏛  Orvius CI gate\n");

await run("npm", ["run", "build"], serverEnv);
await run("npm", ["run", "test:trust"], serverEnv);

const server = spawn("npm", ["run", "start"], {
  env: serverEnv,
  stdio: "ignore",
  detached: true,
});

let serverStopped = false;
function stopServer() {
  if (serverStopped) return;
  serverStopped = true;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

process.on("SIGINT", () => {
  stopServer();
  process.exit(130);
});
process.on("exit", stopServer);

try {
  await waitForHealth();
  await run("npm", ["run", "standard:check"], { ...process.env, APP_URL });
  console.log("\n✅ CI GATE: PASS\n");
} finally {
  stopServer();
}
