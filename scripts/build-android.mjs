// Build the checked-in Android app without the historical external work/ tree.
import { cp, copyFile, mkdir, readFile, stat, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const android = path.join(root, 'android');
const require = createRequire(path.join(root, 'windows/package.json'));
const { build } = require('esbuild');
const { version } = JSON.parse(await readFile(path.join(root, 'windows/src-tauri/tauri.conf.json')));
// MainActivity serves /index.html from getAssets().open("web/index.html").
// Keep the APK's physical asset directory aligned with that native route.
const assetsRoot = path.join(android, 'build/assets');
const assets = path.join(assetsRoot, 'web');
await rm(assetsRoot, { recursive: true, force: true });
await mkdir(assets, { recursive: true });
await build({
  entryPoints: [path.join(android, 'web/main.ts')], bundle: true,
  format: 'esm', target: 'chrome110', minify: true,
  outfile: path.join(assets, 'main.js'), logLevel: 'info',
});
await copyFile(path.join(android, 'web/index.html'), path.join(assets, 'index.html'));
const pdf = path.join(android, 'node_modules/pdfjs-dist');
await copyFile(path.join(pdf, 'legacy/build/pdf.worker.min.mjs'), path.join(assets, 'pdf.worker.mjs'));
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(path.join(pdf, directory), path.join(assets, directory), { recursive: true });
}
for (const name of ['THIRD-PARTY-LICENSES.txt', 'THIRD-PARTY-NATIVE-MEDIA-LICENSES.txt']) {
  await copyFile(path.join(android, 'web', name), path.join(assets, name));
}
await copyFile(path.join(root, 'windows/THIRD-PARTY-STORAGE-LICENSES.txt'), path.join(assets, 'THIRD-PARTY-STORAGE-LICENSES.txt'));
if (process.argv.includes('--assets-only')) process.exit(0);
const gradle = process.env.GRADLE_BIN || (process.platform === 'win32' ? 'gradle.bat' : 'gradle');
const gradleArgs = ['--no-daemon', 'assembleRelease', 'assembleDebug'];
if (process.argv.includes('--offline')) gradleArgs.push('--offline');
if (process.argv.includes('--with-spotube')) {
  const repository = process.env.SPOTUBE_REPOSITORY || path.join(android, 'spotube-module/build/host/outputs/repo');
  // Fail before Gradle if the embedded runtime was not actually built.
  await stat(path.join(repository, 'com/coucou/spotube/flutter_release/1.0/flutter_release-1.0.aar'));
  await stat(path.join(repository, 'com/coucou/spotube/flutter_debug/1.0/flutter_debug-1.0.aar'));
  gradleArgs.push(`-PspotubeRepository=${repository}`);
  // Upstream native plugins still contain pre-AndroidX bytecode.
  gradleArgs.push('-Pandroid.enableJetifier=true');
  // Engine jars contain large native binaries and already use AndroidX.
  gradleArgs.push('-Pandroid.jetifier.ignorelist=flutter_embedding.*,arm64_v8a.*,x86_64.*');
  gradleArgs.push('-Dorg.gradle.jvmargs=-Xmx3072m -Dfile.encoding=UTF-8');
}
const result = spawnSync(gradle, gradleArgs, {
  stdio: 'inherit', env: process.env, cwd: android, shell: process.platform === 'win32',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const out = path.join(root, 'releases');
await mkdir(out, { recursive: true });
for (const [variant, suffix] of [
  ['release', 'unsigned'],
  ['debug', 'debug'],
]) {
  const directory = path.join(android, 'gradle-build/outputs/apk', variant);
  const metadata = JSON.parse(await readFile(path.join(directory, 'output-metadata.json')));
  if (metadata.applicationId !== 'com.coucou.workspace' || metadata.elements.length !== 1) {
    throw Error(`Unexpected APK metadata for ${variant}`);
  }
  const input = metadata.elements[0];
  if (input.versionName !== version || path.basename(input.outputFile) !== input.outputFile) {
    throw Error(`APK version or output path mismatch for ${variant}`);
  }
  const source = path.join(directory, input.outputFile);
  if ((await stat(source)).size === 0) throw Error(`Empty APK: ${source}`);
  const check = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    [path.join(root, 'scripts/check-android-apk.py'), source], { stdio: 'inherit' });
  if (check.error) throw check.error;
  if (check.status !== 0) process.exit(check.status || 1);
  const dest = path.join(out, `AnF-Android-${version}-${suffix}.apk`);
  await copyFile(source, dest);
  console.log(`Prepared ${dest}`);
}
