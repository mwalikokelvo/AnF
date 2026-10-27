// UI-01 build check: every stylesheet a built page links must exist in the package, be non-trivial,
// and (for the workspace) carry the rules that lay it out. Usage: node scripts/check-styles.mjs <built web folder>
import {readdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || 'windows/dist');
const pages = (await readdir(dir)).filter(f => f.endsWith('.html'));
if (!pages.length) throw Error(`No built pages in ${dir}`);
// A rule each page's own stylesheet must contain, so a stale or empty file is caught too.
const expected = {'workspace.html': ['.workspace-layout', '.workspace-navigation'], 'index.html': []};
let problems = 0;
// A "(" left open inside a declaration makes the browser treat the rest of the file as one value: the page
// still gets a stylesheet, but most rules silently vanish. Returns a snippet of the first such spot.
function unbalanced(css) {
  let parens = 0, quote = '', at = -1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && css[i + 1] === '*') { const end = css.indexOf('*/', i + 2); i = end < 0 ? css.length : end + 1; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') { if (!parens) at = i; parens++; }
    else if (c === ')') parens = Math.max(0, parens - 1);
    else if (c === '}' && parens) return css.slice(Math.max(0, at - 60), at + 40);
  }
  return parens ? css.slice(Math.max(0, at - 60), at + 40) : '';
}
for (const page of pages) {
  const html = await readFile(path.join(dir, page), 'utf8');
  const links = [...html.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)]
    .map(tag => /href=["']?([^"' >]+)/i.exec(tag[0])?.[1]).filter(Boolean);
  let css = '';
  for (const href of links) {
    if (/^[a-z]+:/i.test(href)) { console.error(`${page}: stylesheet ${href} is not packaged with the app`); problems++; continue; }
    const file = path.join(dir, href.replace(/^\//, ''));
    const size = await stat(file).then(s => s.size, () => -1);
    if (size < 200) { console.error(`${page}: stylesheet ${href} is ${size < 0 ? 'missing' : 'nearly empty'}`); problems++; continue; }
    const text = await readFile(file, 'utf8');
    const broken = unbalanced(text);
    if (broken) { console.error(`${page}: ${href} has an unclosed bracket, which hides every rule after it: …${broken}…`); problems++; }
    css += text;
  }
  for (const selector of expected[page] || []) {
    if (!css.includes(selector)) { console.error(`${page}: no stylesheet defines ${selector}`); problems++; }
  }
  console.log(`${page}: ${links.length} stylesheet(s), ${css.length.toLocaleString()} characters`);
}
if (problems) process.exit(1);
console.log('Every linked stylesheet is packaged.');
