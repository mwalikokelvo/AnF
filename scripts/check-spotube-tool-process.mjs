// Actual Node/OS tool invocation, without installing or running Flutter/Gradle.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnTool } from '../integrations/spotube/tool-process.mjs';
const fixture = mkdtempSync(path.join(tmpdir(), 'anf-tool-probe-'));
try {
  const script = path.join(fixture, 'probe.mjs');
  writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  let command = process.execPath, args = [script];
  if (process.platform === 'win32') {
    command = path.join(fixture, 'flutter probe.cmd');
    writeFileSync(command, '@echo off\r\n"' + process.execPath + '" "%~dp0probe.mjs" %*\r\n');
    args = [];
    for (const rejected of ['unsafe%PATH%', 'bad"quote', 'new\nline'])
      assert.throws(() => spawnTool(command, [rejected]), /Unsupported batch argument/);
  }
  const literals = ['--version', '--machine', 'path with spaces', 'literal&argument', '$literal', '`literal`'];
  const result = spawnTool(command, [...args, ...literals], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), literals);
  if (process.platform === 'win32') {
    // Reproduce Flutter's actual SDK-root lookup through a PATH-resolved .bat.
    const probe = 'anf-root-probe.cmd';
    writeFileSync(path.join(fixture, probe), '@echo off\r\necho %~dp0\r\n');
    const found = spawnTool(probe, [], {
      cwd: path.dirname(fixture),
      env: { ...process.env, PATH: fixture + path.delimiter + process.env.PATH },
      encoding: 'utf8',
    });
    assert.ifError(found.error);
    assert.equal(found.status, 0, found.stderr);
    // Hosted Windows TEMP may use an 8.3 alias (RUNNER~1); compare the actual
    // directories, not spelling. An incorrect cwd still resolves elsewhere.
    assert.equal(realpathSync.native(found.stdout.trim()).toLowerCase(),
      realpathSync.native(fixture).toLowerCase(), 'PATH tool must retain its own script directory');
  }
} finally {
  const parent = realpathSync.native(tmpdir());
  const resolved = realpathSync.native(fixture);
  assert.equal(path.dirname(resolved).toLowerCase(), parent.toLowerCase());
  assert.match(path.basename(resolved), /^anf-tool-probe-/);
  rmSync(resolved, { recursive: true });
}
console.log('PASS: actual tool invocation preserves literal arguments and PATH batch script root. No Flutter/native app acceptance.');
