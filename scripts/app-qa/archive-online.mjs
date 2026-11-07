// Online check: the Archive tab searches archive.org (LibriVox public-domain
// audiobooks) and plays a part through the real player. Needs network access, so
// it only runs when ARCHIVE_ONLINE=1. Uses the same static server and Edge
// channel as the other app-qa scripts.
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {go} from './fixture.mjs';

if (process.env.ARCHIVE_ONLINE !== '1') {
  console.log('SKIP: set ARCHIVE_ONLINE=1 to run the live archive.org check.');
  process.exit(0);
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = path.resolve(process.env.DIST_DIR || path.join(root, 'windows/dist'));
const output = path.join(root, 'releases/music-hub-previews');
await mkdir(output, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(base, decodeURIComponent(url.pathname.slice(1)));
    if (!file.startsWith(base + path.sep)) throw Error('Path');
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm'})[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});
await new Promise(resolve => server.listen(4182, '127.0.0.1', resolve));

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : { channel: 'msedge' }),
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await context.addInitScript(() => {
    window.__playedSrc = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      try { window.__playedSrc.push(this.currentSrc || this.src || ''); } catch { /* ignore */ }
      return play.apply(this, arguments);
    };
    let current = { id: 'fixture', name: 'Archive QA', title: 'Saved work', draft: '', question: '', history: [], sources: [], memory: '', model: 'fast' };
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      switch (command) {
        case 'workspace_list_projects': return [{ id: 'fixture', name: 'Archive QA', updated: Date.now() }];
        case 'workspace_load_project': return current;
        case 'workspace_save_project': current = args.project; return current;
        case 'workspace_diagnostics': return { runtime: true, fast: true, balanced: true, ocr: true, documents: 'Local', log: 'Fixture', version: '0.1.48' };
        case 'link_address': return '';
        case 'link_status': return false;
        case 'music_available': return false;
        case 'music_pause': return;
        case 'music_hide': return;
        case 'log_line': return;
        default: throw Error('Unexpected IPC ' + command);
      }
    } };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/error|failed|archive/i.test(message.text())) console.log('CONSOLE', message.type(), message.text().slice(0, 200)); });
  page.on('request', request => { if (request.url().includes('archive.org')) console.log('REQ', request.resourceType(), request.url().slice(0, 140)); });
  await page.goto('http://127.0.0.1:4182/workspace.html');
  await page.locator('[data-view="music"]').waitFor({ state: 'attached' });
  await go(page, 'music');
  await page.getByRole('tab', { name: 'Archive', exact: true }).click();

  const lookups = page.getByLabel('Online lookups', { exact: true });
  if (!(await lookups.isChecked())) await lookups.check();
  await page.getByLabel('Search the Internet Archive', { exact: true }).fill('sherlock holmes');
  await page.getByRole('button', { name: 'Search archive', exact: true }).click();

  await page.locator('.music-archive-row').first().waitFor({ timeout: 45000 });
  const rows = await page.locator('.music-archive-row').count();
  assert.ok(rows > 0, 'archive search returns at least one audiobook');

  const title = await page.locator('.music-archive-row strong').first().textContent();
  await page.locator('.music-archive-row .music-archive-play').first().click();
  await page.locator('.music-player button[aria-label="Pause"]').waitFor({ timeout: 45000 });
  await page.waitForTimeout(2500);
  const playing = await page.locator('.music-player strong').first().textContent();
  assert.ok(playing && playing.trim().length > 0, 'the player shows a playing title');
  const played = await page.evaluate(() => window.__playedSrc || []);
  console.log('DEBUG played=', JSON.stringify(played));
  console.log('DEBUG title=', JSON.stringify(title), 'playing=', JSON.stringify(playing));
  await page.screenshot({ path: path.join(output, 'archive-streaming.png') });
  assert.ok(played.some(src => /^https?:\/\/([^/]+\.)?archive\.org\//.test(src)), 'audio is streamed from archive.org, not a local blob');
  const src = played.find(src => /^https?:\/\/([^/]+\.)?archive\.org\//.test(src)) || '';
  await page.screenshot({ path: path.join(output, 'archive-streaming.png') });
  console.log(`PASS archive.org online: ${rows} results; played "${title?.trim()}" (player "${playing?.trim()}") from ${new URL(src).host}.`);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}


