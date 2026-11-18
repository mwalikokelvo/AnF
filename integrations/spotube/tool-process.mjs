import { spawnSync } from 'node:child_process';
import path from 'node:path';

// cmd.exe is necessary for Windows batch tools such as Flutter and gradlew.
// Keep delayed expansion off and reject values cmd would expand before launch.
export function spawnTool(bin, args, options = {}) {
  const batch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(bin);
  if (!batch) return spawnSync(bin, args, options);
  if ([bin, ...args].some(value => /["%\r\n\x00]/.test(value))) throw Error('Unsupported batch argument.');
  // A quoted bare batch name found through PATH can leave %~dp0 pointing at
  // cwd instead of the script directory. Flutter derives its SDK root from it.
  // Resolve without a shell, preserving the caller's PATH/cwd for lookup.
  if (!/[\\/]/.test(bin)) {
    const located = spawnSync('where.exe', [bin], {
      cwd: options.cwd, env: options.env, encoding: 'utf8',
    });
    if (located.error) throw located.error;
    if (located.status !== 0) throw Error('Windows batch tool not found: ' + bin);
    bin = located.stdout.split(/\r?\n/).find(line => line.trim())?.trim();
    if (!bin || !path.isAbsolute(bin)) throw Error('Windows batch tool lookup returned no absolute path.');
  } else {
    bin = path.resolve(options.cwd || process.cwd(), bin);
  }
  if (/["%\r\n\x00]/.test(bin)) throw Error('Unsupported batch argument.');
  return spawnSync(process.env.ComSpec || 'cmd.exe',
    ['/d', '/v:off', '/s', '/c', '"' + [bin, ...args].map(value => '"' + value + '"').join(' ') + '"'],
    { ...options, windowsVerbatimArguments: true });
}
