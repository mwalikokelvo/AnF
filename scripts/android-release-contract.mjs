import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// Only product inputs, never generated build directories, keys or user data.
const directories = ['android/web', 'android/java', 'android/res', 'android/spotube-host', 'windows/src'];
const files = ['android/AndroidManifest.xml', 'android/build.gradle', 'android/settings.gradle',
  'android/gradle.properties', 'android/package-lock.json', 'windows/package-lock.json',
  'windows/src-tauri/tauri.conf.json', 'scripts/build-android.mjs',
  'scripts/prepare-android-sdk.mjs', 'scripts/verify-android-release.mjs',
  'scripts/android-release-contract.mjs', 'scripts/check-android-apk.py'];

export async function androidContract(root) {
  const inputs = [...files];
  async function walk(relative) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = relative + '/' + entry.name;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) inputs.push(name);
      else throw Error('Unexpected linked Android source: ' + name);
    }
  }
  for (const directory of directories) await walk(directory);
  const hash = createHash('sha256');
  for (const name of inputs.sort()) hash.update(name + '\0').update(await readFile(path.join(root, name))).update('\0');
  const config = JSON.parse(await readFile(path.join(root, 'windows/src-tauri/tauri.conf.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(config.version)) throw Error('Android requires a numeric three-part release version.');
  const components = config.version.split('.').map(Number);
  const gradle = await readFile(path.join(root, 'android/build.gradle'), 'utf8');
  const applicationId = gradle.match(/applicationId\s+['"]([a-z][a-z0-9_.]+)['"]/)?.[1];
  if (!applicationId) throw Error('Missing literal Android application ID.');
  return { schema: 1, version: config.version, versionCode: components[0] * 1000000 + components[1] * 1000 + components[2], applicationId, sourceSha256: hash.digest('hex') };
}
