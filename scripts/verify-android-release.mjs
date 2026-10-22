import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { androidContract } from './android-release-contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const contract = await androidContract(root);
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw Error('ANDROID_HOME is required to inspect real APK manifests, signatures and alignment.');
const tools = path.join(sdk, 'build-tools/36.0.0');
const suffix = process.platform === 'win32' ? '.exe' : '';
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${path.basename(command)} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
const artifacts = [];
for (const variant of ['unsigned', 'debug']) {
  const filename = `AnF-Android-${contract.version}-${variant}.apk`;
  const apk = path.join(root, 'releases', filename);
  const metadata = await stat(apk); // A web-assets build cannot satisfy this gate.
  if (metadata.size < 100000) throw Error('Missing or implausibly small APK: ' + filename);
  const badging = run(path.join(tools, 'aapt' + suffix), ['dump', 'badging', apk]);
  const identity = badging.match(/^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/m);
  if (!identity || identity[1] !== contract.applicationId || Number(identity[2]) !== contract.versionCode || identity[3] !== contract.version) throw Error('APK identity/version mismatch: ' + filename);
  run(path.join(tools, 'zipalign' + suffix), ['-c', '-P', '16', '4', apk]);
  run(process.env.ANF_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'),
    [path.join(root, 'scripts/check-android-apk.py'), apk, '--assets-dir', path.join(root, 'android/build/assets/web'), '--contract', JSON.stringify(contract)]);
  if (variant === 'debug') {
    const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java' + suffix) : 'java';
    run(java, ['-jar', path.join(tools, 'lib/apksigner.jar'), 'verify', '--verbose', apk]);
  }
  const sha256 = createHash('sha256').update(await readFile(apk)).digest('hex');
  artifacts.push({ filename, bytes: metadata.size, sha256, signing: variant === 'unsigned' ? 'unsigned; must be signed before installation' : 'development certificate; not production signing' });
  console.log(`PASS: ${filename}: current source, manifest, packaged assets, native libraries, ZIP integrity, 16 KB alignment${variant === 'debug' ? ', signature' : ''}.`);
}
await writeFile(path.join(root, 'releases/android-release-verification.json'), JSON.stringify({ ...contract, artifacts }, null, 2) + '\n');
await writeFile(path.join(root, 'releases/SHA256SUMS-Android'), artifacts.map(a => `${a.sha256}  ${a.filename}`).join('\n') + '\n');
