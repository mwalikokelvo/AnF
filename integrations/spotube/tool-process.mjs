import { spawnSync } from 'node:child_process';

// cmd.exe is necessary for Windows batch tools such as Flutter and gradlew.
// Keep delayed expansion off and reject values cmd would expand before launch.
export function spawnTool(bin, args, options = {}) {
  const batch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(bin);
  if (!batch) return spawnSync(bin, args, options);
  if ([bin, ...args].some(value => /["%\r\n\x00]/.test(value))) throw Error('Unsupported batch argument.');
  return spawnSync(process.env.ComSpec || 'cmd.exe',
    ['/d', '/v:off', '/s', '/c', '"' + [bin, ...args].map(value => '"' + value + '"').join(' ') + '"'],
    { ...options, windowsVerbatimArguments: true });
}
