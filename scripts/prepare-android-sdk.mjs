// Command-line tools 23 use slash-separated package IDs. The compatibility
// sdkmanager wrapper can report success after rejecting old semicolon IDs.
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw Error('Set ANDROID_HOME to the Android SDK directory.');
const windows = process.platform === 'win32';
const args=process.argv.slice(2);
if(args.length>1||args.some(arg=>!['--check','--print-cli'].includes(arg)))throw Error('Use --check, --print-cli or no option.');
// setup-android installs a requested build in its numeric directory and may
// leave an older, sdkmanager-only "latest" installation beside it.
const cli = ['16111833','latest'].map(version=>path.join(sdk,'cmdline-tools',version,'bin',windows?'android.exe':'android'))
  .find(file=>existsSync(file)&&statSync(file).isFile());
if(args.includes('--print-cli')){
  if(!cli)throw Error('Install Android command-line tools 23 (16111833) under ANDROID_HOME/cmdline-tools/16111833 or latest.');
  console.log(cli);process.exit(0);
}
if (!args.includes('--check')) {
if (!cli) throw Error('Install Android command-line tools 23 (16111833) under ANDROID_HOME/cmdline-tools/16111833 or latest.');
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
