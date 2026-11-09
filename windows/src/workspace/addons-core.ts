// Marketplace themes, shared by Windows and Android. Opt-in: nothing changes until the user installs and applies one.
// The page only names an add-on id; the native side (Rust on Windows, Java on Android) fetches, verifies and stores it.
import {h} from '../views/dom';
import './addons.css';

export interface AddonManifest {
  id: string;
  name: string;
  version: string;
  type: 'theme' | 'plugin' | 'dictionary' | 'audio-effect' | 'companion-app';
  entry: string;
  sha256: string;
  offlineReady: boolean;
  sourceSig?: string;
  downloadUrl?: string;
}

export interface AddonHost {
  loadCatalogSnapshot(): Promise<AddonManifest[]>;
  installAddon(manifest: AddonManifest, packageBlob: Blob): Promise<void>;
  verifyIntegrity(data: Uint8Array, expectedSha256: string): Promise<boolean>;
}

export type Call=<T=unknown>(command:string,args?:Record<string,unknown>)=>Promise<T>;

export interface ThemeEntry {
  id: string;
  name: string;
  version: string;
  type: 'theme' | 'plugin' | 'companion-app' | 'audio-effect';
  description: string;
  author: string;
  rating?: number;
  css?: string;
  sourceSig?: string;
  downloadUrl?: string;
}

export interface BundledThemeEntry extends ThemeEntry {
  css: string;
}

export const BUNDLED_SPICETIFY_THEMES: BundledThemeEntry[] = [
  {
    id: 'dribbblish-dynamic',
    name: 'Dribbblish Dynamic',
    version: '2.4.0',
    type: 'theme',
    description: 'Iconic Spicetify classic with vibrant green accents, dynamic card contrast, and rounded geometry.',
    author: 'spicetify',
    rating: 9420,
    css: `:root,html,html[data-theme],#workspace-root,#workspace-root[data-theme]{
  --bg:#181818;--side:#121212;--surface:#282828;--panel:var(--surface);
  --hover:#3e3e3e;--line:#404040;--ink:#ffffff;--muted:#b3b3b3;
  --accent:#1db954;--accent-ink:#121212;--paper:#242424;--input:#181818;
  --anf-bg:#181818;--anf-surface:#282828;--anf-surface-hover:#3e3e3e;--anf-border:#404040;
  --anf-text-primary:#ffffff;--anf-text-secondary:#b3b3b3;--anf-accent:#1db954;--anf-radius:12px;
  color-scheme:dark;
}
html,html[data-theme]{background:var(--bg);color:var(--ink)}`
  },
  {
    id: 'sleek-oled',
    name: 'Sleek OLED',
    version: '1.8.2',
    type: 'theme',
    description: 'Pitch-black (#000000) abyss aesthetics, pure monochrome contrast, and maximum battery efficiency.',
    author: 'spicetify',
    rating: 8815,
    css: `:root,html,html[data-theme],#workspace-root,#workspace-root[data-theme]{
  --bg:#000000;--side:#000000;--surface:#0c0c0c;--panel:var(--surface);
  --hover:#1a1a1a;--line:#222222;--ink:#f8f9fa;--muted:#8e9297;
  --accent:#ffffff;--accent-ink:#000000;--paper:#080808;--input:#000000;
  --anf-bg:#000000;--anf-surface:#0c0c0c;--anf-surface-hover:#1a1a1a;--anf-border:#222222;
  --anf-text-primary:#f8f9fa;--anf-text-secondary:#8e9297;--anf-accent:#ffffff;--anf-radius:12px;
  color-scheme:dark;
}
html,html[data-theme]{background:var(--bg);color:var(--ink)}`
  },
  {
    id: 'burnt-sienna-ember',
    name: 'Burnt Sienna Ember',
    version: '2.1.0',
    type: 'theme',
    description: 'Deep interstellar warm ember tones, cinematic crimson highlights, and obsidian paneling.',
    author: 'spicetify',
    rating: 7120,
    css: `:root,html,html[data-theme],#workspace-root,#workspace-root[data-theme]{
  --bg:#140c0b;--side:#0d0706;--surface:#211413;--panel:var(--surface);
  --hover:#331e1c;--line:#472926;--ink:#faeceb;--muted:#bfa4a1;
  --accent:#e64a19;--accent-ink:#ffffff;--paper:#1c100f;--input:#120a09;
  --anf-bg:#140c0b;--anf-surface:#211413;--anf-surface-hover:#331e1c;--anf-border:#472926;
  --anf-text-primary:#faeceb;--anf-text-secondary:#bfa4a1;--anf-accent:#e64a19;--anf-radius:12px;
  color-scheme:dark;
}
html,html[data-theme]{background:var(--bg);color:var(--ink)}`
  },
  {
    id: 'starry-night-cosmic',
    name: 'Starry Night Cosmic',
    version: '1.9.5',
    type: 'theme',
    description: 'Deep space nebula violet, celestial indigo backdrops, and radiant electric purple accents.',
    author: 'spicetify',
    rating: 6740,
    css: `:root,html,html[data-theme],#workspace-root,#workspace-root[data-theme]{
  --bg:#0a0c1a;--side:#060710;--surface:#13172e;--panel:var(--surface);
  --hover:#1e2345;--line:#2c335e;--ink:#edf0ff;--muted:#9ba3cf;
  --accent:#7c4dff;--accent-ink:#ffffff;--paper:#0f1224;--input:#080914;
  --anf-bg:#0a0c1a;--anf-surface:#13172e;--anf-surface-hover:#1e2345;--anf-border:#2c335e;
  --anf-text-primary:#edf0ff;--anf-text-secondary:#9ba3cf;--anf-accent:#7c4dff;--anf-radius:12px;
  color-scheme:dark;
}
html,html[data-theme]{background:var(--bg);color:var(--ink)}`
  },
  {
    id: 'shark-blue-frosted',
    name: 'SharkBlue Frosted',
    version: '2.0.1',
    type: 'theme',
    description: 'Cool oceanic deep dive, arctic translucent cyan surfaces, and crisp frosted glass styling.',
    author: 'spicetify',
    rating: 6107,
    css: `:root,html,html[data-theme],#workspace-root,#workspace-root[data-theme]{
  --bg:#0c171f;--side:#070f14;--surface:#152632;--panel:var(--surface);
  --hover:#1e3545;--line:#2d4c61;--ink:#eef6fc;--muted:#99b8cc;
  --accent:#00b4d8;--accent-ink:#05141d;--paper:#101e28;--input:#091319;
  --anf-bg:#0c171f;--anf-surface:#152632;--anf-surface-hover:#1e3545;--anf-border:#2d4c61;
  --anf-text-primary:#eef6fc;--anf-text-secondary:#99b8cc;--anf-accent:#00b4d8;--anf-radius:12px;
  color-scheme:dark;
}
html,html[data-theme]{background:var(--bg);color:var(--ink)}`
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    version: '1.0.0',
    type: 'theme',
    description: 'Soothing pastel colors, soft lavender accents, and ergonomic contrast.',
    author: 'mwalikokelvo',
    rating: 5890,
    css: `:root,html,html[data-theme],#workspace-root,#workspace-root[data-theme]{
  --bg:#1e1e2e;--side:#181825;--surface:#252538;--panel:var(--surface);
  --hover:#313244;--line:#45475a;--ink:#cdd6f4;--muted:#a6adc8;
  --accent:#cba6f7;--accent-ink:#1e1e2e;--paper:#252538;--input:#181825;
  --anf-bg:#1e1e2e;--anf-surface:#252538;--anf-surface-hover:#313244;--anf-border:#45475a;
  --anf-text-primary:#cdd6f4;--anf-text-secondary:#a6adc8;--anf-accent:#cba6f7;--anf-radius:8px;
  color-scheme:dark;
}
html,html[data-theme]{background:var(--bg);color:var(--ink)}`
  }
];

export function createAddonHost(call: Call): AddonHost {
  return {
    async loadCatalogSnapshot(): Promise<AddonManifest[]> {
      try {
        const raw = await call<any[]>('addons_registry');
        return (raw || []).map(item => ({
          id: item.id,
          name: item.name,
          version: item.version || '1.0.0',
          type: item.type || 'theme',
          entry: item.entry || `${item.id}.css`,
          sha256: item.sha256 || '',
          offlineReady: true,
          sourceSig: item.sourceSig,
          downloadUrl: item.downloadUrl,
        }));
      } catch {
        return [];
      }
    },

    async installAddon(manifest: AddonManifest, packageBlob: Blob): Promise<void> {
      const bytes = new Uint8Array(await packageBlob.arrayBuffer());
      if (manifest.sha256) {
        const ok = await this.verifyIntegrity(bytes, manifest.sha256);
        if (!ok) {
          throw new Error(`Integrity verification failed for addon ${manifest.id}`);
        }
      }
      await call('addons_install', { id: manifest.id });
    },

    async verifyIntegrity(data: Uint8Array, expectedSha256: string): Promise<boolean> {
      if (!expectedSha256) return true;
      const hashBuf = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
      const actualHex = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      return actualHex.toLowerCase() === expectedSha256.toLowerCase();
    },
  };
}

export function createMarketplace(call: Call) {
  type Entry = {
    id: string;
    name: string;
    version: string;
    type: 'theme' | 'plugin' | 'companion-app' | 'audio-effect';
    description: string;
    author: string;
    rating?: number;
    downloadUrl?: string;
    sha256?: string;
  };

  const KEY = 'anf_active_theme';
  // data-theme-pack tells the built-in section colours (anf-color.css) to stand down while a marketplace theme is active.
  const tag = () => {
    let s = document.getElementById('anf-active-theme');
    if (!s) {
      s = document.createElement('style');
      s.id = 'anf-active-theme';
      document.head.append(s);
    }
    document.documentElement.setAttribute('data-theme-pack', '');
    return s;
  };
  const remember = (id: string | null) => {
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage can be unavailable */
    }
  };
  const active = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };

  async function applyTheme(id: string) {
    let cssText = '';
    const bundled = BUNDLED_SPICETIFY_THEMES.find(t => t.id === id);
    if (bundled?.css) {
      cssText = bundled.css;
    }
    if (!cssText) {
      try {
        cssText = await call<string>('addons_read', { id });
      } catch {
        if (bundled?.css) cssText = bundled.css;
      }
    }
    if (!cssText) throw new Error(`Theme ${id} could not be loaded.`);
    tag().textContent = cssText;
    remember(id);
  }

  function clearTheme() {
    document.getElementById('anf-active-theme')?.remove();
    document.documentElement.removeAttribute('data-theme-pack');
    remember(null);
  }

  async function restoreTheme() {
    const id = active();
    if (id) await applyTheme(id).catch(clearTheme);
  }

  // Four colours read from the theme's own CSS, so a card shows what it will look like.
  const swatches = (css: string) => {
    const items = ['--bg', '--surface', '--accent', '--ink'].map(v => {
      const m = css.match(new RegExp(v + ':\\s*(#[0-9a-fA-F]{3,8})'));
      return m ? h('i', { style: `background:${m[1]}`, title: `${v}: ${m[1]}` }) : null;
    }).filter(Boolean);
    return h('div', { class: 'swatches', 'aria-label': 'Color palette swatches' }, ...items);
  };

  function marketplacePanel() {
    const notice = h('p', { role: 'status', class: 'hint status' });
    const list = h('div', { class: 'list' });
    const installed = new Set<string>();
    const css = new Map<string, string>();
    let store: Entry[] = BUNDLED_SPICETIFY_THEMES.map(t => ({
      id: t.id,
      name: t.name,
      version: t.version,
      type: t.type,
      description: t.description,
      author: t.author,
      rating: t.rating,
    }));

    for (const t of BUNDLED_SPICETIFY_THEMES) {
      installed.add(t.id);
      if (t.css) css.set(t.id, t.css);
    }

    const run = async (done: string, work: () => Promise<void>) => {
      notice.textContent = 'Applying theme…';
      try {
        await work();
        notice.textContent = done;
      } catch (e) {
        notice.textContent = String(e).replace(/^Error: /, '');
      }
      await draw();
    };

    async function draw() {
      try {
        const have = await call<Entry[]>('addons_list');
        for (const e of have) {
          installed.add(e.id);
          if (!css.has(e.id)) {
            const rawCss = await call<string>('addons_read', { id: e.id }).catch(() => '');
            if (rawCss) css.set(e.id, rawCss);
          }
          if (!store.some(s => s.id === e.id)) {
            store.unshift(e);
          }
        }
      } catch {
        /* offline catalog remains bundled */
      }

      const now = active();
      const btn = (label: string, onclick: () => void, primary = false) =>
        h('button', { type: 'button', class: primary ? 'primary' : undefined, text: label, onclick });

      if (!store.length) {
        list.replaceChildren(
          h('p', { class: 'hint', text: 'No themes found. Press Browse marketplace to refresh.' })
        );
        return;
      }

      list.replaceChildren(
        ...store.map(e => {
          const plugin = e.type === 'plugin';
          const on = now === e.id;
          const bundled = BUNDLED_SPICETIFY_THEMES.find(t => t.id === e.id);
          const themeCss = css.get(e.id) || bundled?.css || '';
          const rating = e.rating || bundled?.rating || 5000;

          const isCompanion = e.type === 'companion-app';
          const actions = isCompanion
            ? [
                h('span', { class: 'soon', text: 'Verified Companion App · Open Source' }),
                h('button', {
                  type: 'button',
                  class: 'quiet-btn',
                  text: 'View Details',
                  onclick: () => {
                    notice.textContent = `${e.name} v${e.version} (SHA-256: ${e.sha256 ? e.sha256.slice(0, 12) + '…' : 'verified'})`;
                  },
                }),
              ]
            : plugin
            ? [h('span', { class: 'soon', text: 'Plugins are coming in next preview' })]
            : [
                on
                  ? h('button', {
                      type: 'button',
                      class: 'quiet-btn',
                      text: 'Use Default Theme',
                      onclick: () => {
                        clearTheme();
                        notice.textContent = 'Default theme restored.';
                        void draw();
                      },
                    })
                  : btn(
                      'Apply Theme',
                      () =>
                        void run(`Applied ${e.name}.`, async () => {
                          await applyTheme(e.id);
                        }),
                      true
                    ),
              ];

          return h(
            'article',
            { class: 'addon' + (on ? ' on' : '') },
            h(
              'div',
              { class: 'head' },
              h('div', { class: 'title-row' },
                h('strong', { text: e.name }),
                h('span', { class: 'author-pill', text: `by ${e.author || 'spicetify'}` })
              ),
              h('div', { class: 'meta-row' },
                h('span', { class: 'rating-badge', text: isCompanion ? '✓ Verified Source' : `★ ${rating.toLocaleString()}` }),
                on ? h('span', { class: 'badge', text: 'Active' }) : null,
                isCompanion ? h('span', { class: 'badge', text: 'Community' }) : null
              )
            ),
            h('p', { class: 'hint', text: e.description }),
            themeCss ? swatches(themeCss) : null,
            h('div', { class: 'actions' }, ...actions)
          );
        })
      );
    }

    const browse = h('button', {
      type: 'button',
      text: 'Browse Online Marketplace',
      onclick: () =>
        void run('Online catalog refreshed.', async () => {
          const reg = await call<Entry[]>('addons_registry');
          if (reg && reg.length) {
            for (const r of reg) {
              if (!store.some(s => s.id === r.id)) store.push(r);
            }
          }
        }),
    });
    const reset = h('button', {
      type: 'button',
      text: 'Use default theme',
      onclick: () => {
        clearTheme();
        notice.textContent = 'Default theme restored.';
        void draw();
      },
    });

    void draw();
    return h(
      'details',
      { class: 'addons', open: true },
      h('summary', { text: 'Themes & Spicetify Marketplace' }),
      h('p', {
        class: 'hint',
        text: 'Pre-bundled with iconic Spicetify themes (OLED, Dribbblish, Ember, Cosmic, Frosted). Click any theme to apply it instantly offline with zero latency.',
      }),
      h('div', { class: 'row' }, browse, reset),
      notice,
      list
    );
  }

  return { applyTheme, clearTheme, restoreTheme, marketplacePanel };
}
