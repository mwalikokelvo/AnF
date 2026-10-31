// Source-level release reconciliation evidence. This is not runtime acceptance.
// Reads tracked Git objects only; never reads user profiles, keys or recordings.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';

const [current = 'HEAD', reference = 'v0.1.41', output] = process.argv.slice(2);
const git = (...args) => execFileSync('git', args, {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
const revision = ref => git('rev-parse', '--verify', `${ref}^{commit}`).trim();
const currentSha = revision(current), referenceSha = revision(reference);
const source = (sha, path) => {
  const files = git('ls-tree', '--name-only', sha, '--', path).trim();
  return files ? git('show', `${sha}:${path}`) : '';
};
const capabilities = [
  ['local-voice-synthesis', 'windows/src-tauri/src/lib.rs', ['local_voice::local_voice_speak', 'local_voice::local_voice_cancel']],
  ['voice-process-lifetime', 'windows/src-tauri/src/local_voice.rs', ['voice_process', 'shutdown']],
  ['managed-gateway-lifecycle', 'windows/src-tauri/src/lib.rs', ['managed_omniroute::omniroute_start', 'managed_omniroute::omniroute_stop']],
  ['managed-gateway-repair', 'windows/src-tauri/src/lib.rs', ['managed_omniroute::omniroute_repair', 'managed_omniroute::omniroute_progress']],
  ['saved-connections', 'windows/src-tauri/src/lib.rs', ['connections::connection_save', 'connections::connection_forget']],
  ['native-pdf-preview', 'windows/src-tauri/src/lib.rs', ['pdf_preview::workspace_pdf_page']],
  ['floating-placement', 'windows/src-tauri/src/lib.rs', ['floating::floating_move', 'floating::floating_reset']],
  ['legacy-profile-adoption', 'windows/src-tauri/src/identity.rs', ['old.is_dir()', 'data_dir']],
  ['glass-navigation', 'windows/src/workspace/main.ts', ['attachNavRail']],
  ['rail-focus-handoff', 'windows/src/workspace/nav-rail.ts', ['focus', 'tabindex']],
  ['apps-catalog', 'windows/src/workspace/main.ts', ['appCatalogPanel']],
  ['offline-synced-lyrics', 'windows/src/workspace/music-hub.ts', ['parseLyrics', 'activeLine', 'matchLyricsTrack']],
  ['plugin-marketplace', 'windows/src/workspace/main.ts', ['marketplacePanel']],
  ['desktop-companion', 'windows/src-tauri/src/lib.rs', ['companion::companion_open', 'screen_help::screen_help_capture']],
  ['update-check', 'windows/src-tauri/src/lib.rs', ['updates::update_check']],
  ['native-music-controls', 'windows/src-tauri/src/lib.rs', ['music_native::']],
  ['embedded-spotube-host', 'integrations/spotube/anf_host.dart', ['MethodChannel']],
];
const signals = capabilities.map(([capability, path, tokens]) => {
  const inspect = sha => {
    const text = source(sha, path);
    return {filePresent: !!text, matched: tokens.filter(token => text.includes(token)), expected: tokens};
  };
  return {capability, path, current: inspect(currentSha), reference: inspect(referenceSha)};
});
const identity = sha => ({
  windows: JSON.parse(source(sha, 'windows/src-tauri/tauri.conf.json')).identifier,
  android: source(sha, 'android/build.gradle').match(/applicationId\s+['"]([^'"]+)/)?.[1] ?? null,
  version: JSON.parse(source(sha, 'windows/src-tauri/tauri.conf.json')).version,
});
let merge;
try { merge = git('merge-tree', '--write-tree', currentSha, referenceSha); }
catch (error) {
  // git merge-tree returns 1 for ordinary conflicts; any other error is fatal.
  if (error.status !== 1 || !error.stdout) throw error;
  merge = error.stdout;
}
const report = {
  current: {commit: currentSha, ...identity(currentSha)},
  reference: {commit: referenceSha, ...identity(referenceSha)},
  mergeBase: git('merge-base', currentSha, referenceSha).trim(),
  divergence: git('rev-list', '--left-right', '--count', `${currentSha}...${referenceSha}`).trim(),
  conflicts: merge.split(/\r?\n/).filter(line => line.startsWith('CONFLICT')),
  signals,
  limitation: 'Signals identify registered entry points and tracked implementation tokens, not runtime correctness. Missing signals require manual equivalent-feature review; presence does not prove completeness. No releases or working files are merged by this audit.',
};
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({current: report.current, reference: report.reference, conflicts: report.conflicts.length, signals: signals.length, report: output ?? null}, null, 2));
