import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnTool } from '../integrations/spotube/tool-process.mjs';
import { configureAndroidModule } from '../integrations/spotube/module-identity.mjs';

const spec = configureAndroidModule('name: spotube\nflutter:\n  generate: true\n  assets:\n    - assets/\n');
assert.match(spec, /androidPackage: com\.anf\.spotube\n/);
assert.match(spec, /iosBundleIdentifier: com\.anf\.spotube\n/);
assert.match(spec, /generate: true\n  assets:/);
assert.throws(() => configureAndroidModule('flutter:\n  changed: true'), /configuration changed/);
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
} finally {
  const parent = realpathSync.native(tmpdir());
  const resolved = realpathSync.native(fixture);
  assert.equal(path.dirname(resolved).toLowerCase(), parent.toLowerCase());
  assert.match(path.basename(resolved), /^anf-tool-probe-/);
  rmSync(resolved, { recursive: true });
}
console.log('PASS: native music module identity, upstream drift rejection and real tool invocation with literal arguments.');
