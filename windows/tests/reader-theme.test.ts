import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readerCss = readFileSync(new URL('../src/workspace/reader.css', import.meta.url), 'utf8');
const studioCss = readFileSync(new URL('../src/workspace/studio.css', import.meta.url), 'utf8');
const readerTs = readFileSync(new URL('../src/workspace/reader.ts', import.meta.url), 'utf8');
const railCss = readFileSync(new URL('../src/workspace/nav-rail.css', import.meta.url), 'utf8');
const designCss = readFileSync(new URL('../src/workspace/anf-design.css', import.meta.url), 'utf8');
const ocrTs = readFileSync(new URL('../src/workspace/ocr-client.ts', import.meta.url), 'utf8');

const THEMES = ['dark', 'black', 'sepia', 'light', 'amber'] as const;
const LAYOUT_PROPS = ['width', 'height', 'padding', 'margin', 'font-size', 'line-height', 'border-width', 'top', 'left', 'gap', 'grid-template'];

function channel(hex: string, index: number) {
  const h = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1);
  const value = parseInt(h.slice(index * 2, index * 2 + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(a: string, b: string) {
  const lum = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
  const hi = Math.max(lum(a), lum(b));
  const lo = Math.min(lum(a), lum(b));
  return (hi + 0.05) / (lo + 0.05);
}

function propIn(css: string, selector: string, name: string) {
  let value: string | undefined;
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map(part => part.trim());
    if (!selectors.includes(selector)) continue;
    const found = match[2].match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`));
    if (found) value = found[1];
  }
  return value;
}

/** Base overlay color, then the theme's own declaration. Amber must live in reader.css. */
function themeProp(name: string, theme: (typeof THEMES)[number]) {
  const base = propIn(readerCss, '.reader-overlay', name);
  if (theme === 'dark') {
    assert.ok(base, `.reader-overlay sets ${name}`);
    return base!;
  }
  const own = propIn(readerCss, `.reader-overlay[data-theme=${theme}]`, name) ?? propIn(studioCss, `.reader-overlay[data-theme=${theme}]`, name);
  const value = own ?? base;
  assert.ok(value, `${theme} sets ${name}`);
  return value!;
}

test('reader theme ink and shell chrome stay at least 4.5:1', () => {
  for (const theme of THEMES) {
    const bg = themeProp('--reader-bg', theme);
    const ink = themeProp('--reader-ink', theme);
    const line = themeProp('--reader-line', theme);
    assert.ok(contrast(bg, ink) >= 4.5, `${theme} ink ${ink} on ${bg} is ${contrast(bg, ink).toFixed(2)}`);
    assert.ok(contrast(bg, line) >= 4.5, `${theme} border ${line} on ${bg} is ${contrast(bg, line).toFixed(2)}`);
    const focus = themeProp('--reader-focus', theme);
    const meter = themeProp('--reader-meter', theme);
    const quote = themeProp('--reader-quote', theme);
    assert.ok(contrast(bg, focus) >= 4.5, `${theme} focus ${focus} on ${bg} is ${contrast(bg, focus).toFixed(2)}`);
    assert.ok(contrast(bg, meter) >= 4.5, `${theme} meter ${meter} on ${bg} is ${contrast(bg, meter).toFixed(2)}`);
    assert.ok(contrast(bg, quote) >= 4.5, `${theme} quote ${quote} on ${bg} is ${contrast(bg, quote).toFixed(2)}`);
  }
});

test('reader theme colors ease through tokens and do not transition layout', () => {
  assert.match(readerCss, /--reader-theme-duration\s*:/);
  assert.match(readerCss, /--reader-theme-ease\s*:/);
  assert.match(readerCss, /@property\s+--reader-bg\b/);
  assert.match(readerCss, /@property\s+--reader-ink\b/);
  assert.match(readerCss, /@property\s+--reader-line\b/);
  const bodies = [...readerCss.matchAll(/(^|[{}\s])(\.reader-overlay)\{([^{}]*)\}/g)].map(match => match[3]);
  const transition = bodies.map(body => body.match(/transition\s*:([^;]+)/)?.[1] ?? '').find(value => value.includes('--reader-bg')) ?? '';
  assert.match(transition, /--reader-bg/);
  assert.match(transition, /--reader-ink/);
  assert.match(transition, /--reader-line/);
  for (const prop of LAYOUT_PROPS) assert.equal(transition.includes(prop), false, prop);
  assert.match(readerCss, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\{[^}]*\.reader-overlay\{[^}]*transition\s*:\s*none/);
});

test('amber uses the same reader tokens as the other themes', () => {
  assert.match(readerCss, /\.reader-overlay\[data-theme=amber\]\{[^}]*--reader-bg\s*:/);
  assert.doesNotMatch(studioCss, /\.reader-overlay\[data-theme=amber\][^{]*\{[^}]*\bbackground\s*:/);
  assert.doesNotMatch(studioCss, /\.reader-overlay\[data-theme=amber\][^{]*\{[^}]*\bcolor\s*:/);
  assert.doesNotMatch(studioCss, /\.reader-page\{[^}]*background\s*:/);
});

test('a theme toggle only paints the theme attribute', () => {
  const listener = readerTs.match(/theme\.addEventListener\('change',(\([^)]*\)=>\{[\s\S]*?\}|\(\)=>\{[^}]*\})\s*\)/);
  assert.ok(listener, 'theme change listener');
  assert.match(listener![1], /paintTheme\(/);
  assert.doesNotMatch(listener![1], /fontSize|lineHeight|maxWidth|fontFamily|replaceChildren|render\(/);
});

test('glass shells ease border and overlay together without layout properties', () => {
  assert.doesNotMatch(railCss, /transition\s*:\s*all/);
  const light = railCss.match(/#workspace-root\[data-theme=light\] \.glass-rail:not\(\[data-rail=collapsed\]\)\{([^}]*)\}/);
  assert.ok(light, 'light glass rail rule');
  assert.match(light![1], /background\s*:/);
  assert.match(light![1], /border-color\s*:/);
  const header = designCss.match(/\.workspace-header\{([^}]*)\}/g) ?? [];
  const transition = header.map(rule => rule.match(/transition\s*:([^;]+)/)?.[1] ?? '').find(Boolean);
  assert.ok(transition, 'workspace header color transition');
  assert.match(transition!, /background-color/);
  assert.match(transition!, /border-color/);
  for (const prop of LAYOUT_PROPS) assert.equal(transition!.includes(prop), false, prop);
});

test('reader controls ease color only, and a narrow viewport does not restack the chrome', () => {
  const controls = readerCss.match(/\.reader-overlay :is\(button,select,textarea\)\{([^}]*)\}/);
  assert.ok(controls, 'reader control transition');
  const transition = controls![1].match(/transition\s*:([^;]+)/)?.[1] ?? '';
  assert.match(transition, /background-color/);
  assert.match(transition, /border-color/);
  assert.match(transition, /color/);
  for (const prop of LAYOUT_PROPS) assert.equal(transition.includes(prop), false, prop);
  assert.match(readerCss, /@media\(max-width:700px\)\{[\s\S]*flex-wrap\s*:\s*nowrap/);
  assert.match(readerCss, /scrollbar-gutter\s*:\s*stable/);
  assert.match(readerCss, /\.reader-header h2\{[^}]*text-overflow\s*:\s*ellipsis/);
  assert.match(readerCss, /\.reader-overlay\{[^}]*color-scheme\s*:\s*dark/);
  assert.match(readerCss, /\.reader-overlay\[data-theme=light\],\.reader-overlay\[data-theme=sepia\]\{[^}]*color-scheme\s*:\s*light/);
});

test('the OCR control inside the reader uses reader tokens, not the workspace surface', () => {
  assert.match(readerCss, /--reader-control-bg\s*:\s*var\(--reader-bg\)/);
  assert.match(readerCss, /--reader-control-ink\s*:\s*var\(--reader-ink\)/);
  assert.match(readerCss, /--reader-control-line\s*:\s*var\(--reader-line\)/);
  assert.match(readerCss, /--reader-control-mark\s*:\s*var\(--reader-meter\)/);
  assert.match(ocrTs, /var\(--reader-control-bg,\s*var\(--surface/);
  assert.match(ocrTs, /var\(--reader-control-ink,\s*var\(--ink/);
  assert.match(ocrTs, /var\(--reader-control-line,\s*var\(--line/);
  assert.doesNotMatch(ocrTs, /btn\.style\.background = 'var\(--surface/);
  assert.match(ocrTs, /var\(--reader-control-mark,\s*var\(--accent/);
});

test('light glass drops the blur halo and keeps a readable border on an opaque rail', () => {
  const side = propIn(designCss, '#workspace-root[data-theme=light]', '--side');
  assert.ok(side, 'light --side');
  for (const selector of ['#workspace-root[data-theme=light]', '#workspace-root[data-theme=system]']) {
    const rule = railCss.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.glass-rail:not\\(\\[data-rail=collapsed\\]\\)\\{([^}]*)\\}`));
    assert.ok(rule, selector);
    assert.match(rule![1], /background\s*:\s*var\(--side\)/);
    assert.match(rule![1], /backdrop-filter\s*:\s*none/);
    const line = rule![1].match(/--glass-line\s*:\s*(#[0-9a-fA-F]{6})/)?.[1];
    assert.ok(line, `${selector} sets --glass-line`);
    assert.ok(contrast(side!, line!) >= 4.5, `${selector} glass border ${line} on ${side} is ${contrast(side!, line!).toFixed(2)}`);
  }
  assert.match(designCss, /#workspace-root\{[^}]*background\s*:\s*var\(--bg\)/);
  assert.match(designCss, /#workspace-root\{[^}]*min-height\s*:\s*100%/);
  assert.match(designCss, /#workspace-root\[data-theme=light\] \.workspace-header\{[^}]*backdrop-filter\s*:\s*none/);
  assert.match(designCss, /#workspace-root\[data-theme=system\] \.workspace-header\{[^}]*backdrop-filter\s*:\s*none/);
  assert.match(designCss, /--shell-blur\s*:/);
});
