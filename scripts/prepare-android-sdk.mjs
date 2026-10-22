// Command-line tools 23 use slash-separated package IDs. The compatibility
// sdkmanager wrapper can report success after rejecting old semicolon IDs.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw Error('Set ANDROID_HOME to the Android SDK directory.');
const windows = process.platform === 'win32';
const cli = path.join(sdk, 'cmdline-tools/latest/bin', windows ? 'android.exe' : 'android');
if (!process.argv.includes('--check')) {
if (!existsSync(cli)) throw Error('Install Android command-line tools 23 (16111833) under ANDROID_HOME/cmdline-tools/latest.');
const result = spawnSync(cli, ['--no-metrics', '--sdk', sdk, 'sdk', 'install',
  'platforms/android-37.0', 'build-tools/36.0.0', 'platform-tools'], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
}
for (const file of [
  'platforms/android-37.0/android.jar',
  `build-tools/36.0.0/aapt2${windows ? '.exe' : ''}`,
  `build-tools/36.0.0/aapt${windows ? '.exe' : ''}`,
  `build-tools/36.0.0/zipalign${windows ? '.exe' : ''}`,
  'build-tools/36.0.0/lib/apksigner.jar',
  `platform-tools/adb${windows ? '.exe' : ''}`,
]) {
  if (!existsSync(path.join(sdk, file))) throw Error(`SDK installation is incomplete: ${file}`);
}
console.log('Verified Android platform 37.0, build-tools 36.0.0 and platform-tools.');
