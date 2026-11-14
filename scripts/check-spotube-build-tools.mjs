import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnTool } from '../integrations/spotube/tool-process.mjs';
import { configureAndroidModule } from '../integrations/spotube/module-identity.mjs';
import { embeddedEnvironment } from '../integrations/spotube/embedded-environment.mjs';

const spec = configureAndroidModule('name: spotube\nflutter:\n  generate: true\n  assets:\n    - assets/\n');
const environment=embeddedEnvironment();
assert.match(environment,/LASTFM_API_KEY=\nLASTFM_API_SECRET=\n/);
assert.equal(embeddedEnvironment(environment.replaceAll('\n','\r\n')),environment);
for(const changed of ['LASTFM_API_KEY=private-fixture-value','UNKNOWN_SERVICE_TOKEN=private-fixture-value','ENABLE_UPDATE_CHECK=1']) {
  assert.throws(()=>embeddedEnvironment(changed),error=>error.message.includes('must not be packaged')&&!error.message.includes('private-fixture-value'));
}
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
    assert.equal(path.resolve(found.stdout.trim()), fixture, 'PATH tool must retain its own script directory');
  }
} finally {
  const parent = realpathSync.native(tmpdir());
  const resolved = realpathSync.native(fixture);
  assert.equal(path.dirname(resolved).toLowerCase(), parent.toLowerCase());
  assert.match(path.basename(resolved), /^anf-tool-probe-/);
  rmSync(resolved, { recursive: true });
}
console.log('PASS: native music module identity, upstream drift rejection and real tool invocation with literal arguments.');
