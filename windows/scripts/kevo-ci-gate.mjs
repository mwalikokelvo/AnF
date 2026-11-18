// Kevo Phase 2 Step 2.6: Model choice and the CI gate
// Starts llama-server with the shipped Q8_0 GGUF model pinned in model_download/policy.rs
// (not the Q4_K_M requantized for Linux) and runs the whole phrase list through the real kevo_ask path.
// Fails below 95%.

import { spawn } from 'node:child_process';
import { stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const localAiDir = path.join(root, 'local-ai');
const testsDir = path.join(root, 'tests');

// Step 2.6: Model size choice
// Default is Qwen3 1.7B (Q8_0 GGUF pinned in model_download/policy.rs, model-source.gguf).
// Use the next size up only if the PC has 16 GB RAM or more and self-test shows <= 5s.
const defaultModelName = 'model-source.gguf';

async function fileExists(p) {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function findLlamaServer() {
  const candidates = [
    path.join(localAiDir, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'),
    path.join(root, 'target', 'offline-runtime-linux', 'llama-server'),
  ];
  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }
  return null;
}

async function findModelPath() {
  if (process.env.KEVO_MODEL_PATH && (await fileExists(process.env.KEVO_MODEL_PATH))) {
    return process.env.KEVO_MODEL_PATH;
  }
  const candidate = path.join(localAiDir, defaultModelName);
  if (await fileExists(candidate)) return candidate;
  return null;
}

function checkHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/v1/models`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(port, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkHealth(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log('--- Kevo CI Gate: Phase 2 Step 2.6 ---');
  const llamaServer = await findLlamaServer();
  const modelPath = await findModelPath();

  console.log(`llama-server executable: ${llamaServer ?? 'not found'}`);
  console.log(`shipped Q8_0 model: ${modelPath ?? 'not found'}`);

  let serverProc = null;
  const port = process.env.KEVO_LLAMA_PORT || '18089';
  const serverUrl = `http://127.0.0.1:${port}`;

  if (!llamaServer || !modelPath) {
    if (process.env.CI) {
      console.error('::error::llama-server or shipped model-source.gguf not found in CI environment!');
      process.exit(1);
    } else {
      console.log('Notice: running in mock mode because local-ai assets are not present locally.');
    }
  } else {
    console.log(`Starting llama-server on port ${port} with ${path.basename(modelPath)}...`);
    const serverArgs = [
      '-m',
      modelPath,
      '--jinja',
      '-c',
      '8192',
      '--port',
      port,
      '--host',
      '127.0.0.1',
    ];

    const templatePath = path.join(localAiDir, 'chat-template.jinja');
    if (await fileExists(templatePath)) {
      serverArgs.push('--chat-template-file', templatePath);
    }

    const env = {
      ...process.env,
      LD_LIBRARY_PATH: localAiDir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''),
    };

    serverProc = spawn(llamaServer, serverArgs, {
      stdio: ['ignore', 'inherit', 'inherit'],
      env,
    });

    const isReady = await waitForServer(port, 90000);
    if (!isReady) {
      console.error('::error::llama-server did not become ready within 90 seconds.');
      serverProc.kill();
      process.exit(1);
    }
    console.log('llama-server is healthy and ready.');
  }

  const gateTests = [
    { name: 'phrase list gate', entry: path.join(testsDir, 'kevo-phrases.test.ts'), out: path.join(testsDir, '.kevo-phrases-gate.mjs') },
    { name: 'performance & reasoning evaluation suite', entry: path.join(testsDir, 'kevo-performance.test.ts'), out: path.join(testsDir, '.kevo-perf-gate.mjs') },
  ];

  try {
    for (const gate of gateTests) {
      console.log(`Bundling ${gate.name} (${path.basename(gate.entry)})...`);
      await build({
        entryPoints: [gate.entry],
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node20',
        packages: 'external',
        loader: { '.css': 'empty' },
        outfile: gate.out,
      });

      console.log(`Executing ${gate.name}...`);
      const runnerEnv = {
        ...process.env,
        KEVO_CI_GATE: '1',
      };
      if (serverProc) {
        runnerEnv.KEVO_LLAMA_SERVER_URL = serverUrl;
      }

      const testChild = spawn(process.execPath, ['--test', gate.out], {
        stdio: 'inherit',
        env: runnerEnv,
      });

      const exitCode = await new Promise((resolve) => {
        testChild.on('close', resolve);
      });

      if (exitCode !== 0) {
        console.error(`::error::${gate.name} failed with exit code ${exitCode}.`);
        process.exitCode = exitCode;
        return;
      }
      console.log(`${gate.name} passed successfully!`);
    }
  } finally {
    for (const gate of gateTests) {
      await rm(gate.out, { force: true });
    }
    if (serverProc) {
      console.log('Shutting down llama-server...');
      serverProc.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1000));
      if (!serverProc.killed) serverProc.kill('SIGKILL');
    }
  }
}

await main();
