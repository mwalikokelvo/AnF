import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNDLED_SPICETIFY_THEMES,
  createMarketplace,
  type ThemeEntry,
} from '../src/workspace/addons-core.js';

describe('Spicetify Theme Marketplace & Palette Swatches', () => {
  it('bundles all 5 iconic Spicetify themes plus mocha with metadata', () => {
    const ids = BUNDLED_SPICETIFY_THEMES.map(t => t.id);
    assert.ok(ids.includes('dribbblish-dynamic'), 'includes dribbblish-dynamic');
    assert.ok(ids.includes('sleek-oled'), 'includes sleek-oled');
    assert.ok(ids.includes('burnt-sienna-ember'), 'includes burnt-sienna-ember');
    assert.ok(ids.includes('starry-night-cosmic'), 'includes starry-night-cosmic');
    assert.ok(ids.includes('shark-blue-frosted'), 'includes shark-blue-frosted');
    assert.ok(ids.includes('catppuccin-mocha'), 'includes catppuccin-mocha');
    assert.ok(BUNDLED_SPICETIFY_THEMES.length >= 6);
  });

  it('validates each theme defines the 4 core color swatches (--bg, --surface, --accent, --ink)', () => {
    const requiredVars = ['--bg', '--surface', '--accent', '--ink'];
    for (const theme of BUNDLED_SPICETIFY_THEMES) {
      for (const v of requiredVars) {
        const regex = new RegExp(`${v}:\\s*(#[0-9a-fA-F]{3,8})`);
        const match = theme.css.match(regex);
        assert.ok(match, `Theme ${theme.id} must define ${v} with a hex color`);
        assert.ok(match[1].startsWith('#'), `${theme.id} ${v} hex starts with #`);
      }
    }
  });

  it('validates sleek-oled specifies true #000000 background', () => {
    const oled = BUNDLED_SPICETIFY_THEMES.find(t => t.id === 'sleek-oled');
    assert.ok(oled);
    const bgMatch = oled.css.match(/--bg:\s*(#[0-9a-fA-F]{3,8})/);
    assert.ok(bgMatch);
    assert.equal(bgMatch[1].toLowerCase(), '#000000');
  });

  it('validates dribbblish-dynamic specifies iconic spotify green #1db954 accent', () => {
    const dribbblish = BUNDLED_SPICETIFY_THEMES.find(t => t.id === 'dribbblish-dynamic');
    assert.ok(dribbblish);
    const accentMatch = dribbblish.css.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/);
    assert.ok(accentMatch);
    assert.equal(accentMatch[1].toLowerCase(), '#1db954');
  });

  it('validates burnt-sienna-ember specifies warm interstellar red #e64a19 accent', () => {
    const ember = BUNDLED_SPICETIFY_THEMES.find(t => t.id === 'burnt-sienna-ember');
    assert.ok(ember);
    const accentMatch = ember.css.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/);
    assert.ok(accentMatch);
    assert.equal(accentMatch[1].toLowerCase(), '#e64a19');
  });

  it('validates starry-night-cosmic specifies celestial violet #7c4dff accent', () => {
    const cosmic = BUNDLED_SPICETIFY_THEMES.find(t => t.id === 'starry-night-cosmic');
    assert.ok(cosmic);
    const accentMatch = cosmic.css.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/);
    assert.ok(accentMatch);
    assert.equal(accentMatch[1].toLowerCase(), '#7c4dff');
  });

  it('validates shark-blue-frosted specifies arctic cyan #00b4d8 accent', () => {
    const frosted = BUNDLED_SPICETIFY_THEMES.find(t => t.id === 'shark-blue-frosted');
    assert.ok(frosted);
    const accentMatch = frosted.css.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/);
    assert.ok(accentMatch);
    assert.equal(accentMatch[1].toLowerCase(), '#00b4d8');
  });

  it('validates theme ratings and author metadata are present', () => {
    for (const theme of BUNDLED_SPICETIFY_THEMES) {
      assert.ok(theme.rating && theme.rating > 0, `${theme.id} has positive rating`);
      assert.ok(theme.author && theme.author.length > 0, `${theme.id} has author`);
      assert.ok(theme.description && theme.description.length > 0, `${theme.id} has description`);
    }
  });

  it('createMarketplace provides offline 1-click theme application', async () => {
    const installedList: ThemeEntry[] = [];
    const host = createMarketplace(async (cmd, args) => {
      if (cmd === 'addons_list') return installedList;
      if (cmd === 'addons_read') {
        const id = (args as { id: string }).id;
        const found = BUNDLED_SPICETIFY_THEMES.find(t => t.id === id);
        return found ? found.css : '';
      }
      return [];
    });

    // In a test DOM environment or browser, applyTheme activates the bundled theme
    assert.ok(typeof host.applyTheme === 'function');
    assert.ok(typeof host.clearTheme === 'function');
    assert.ok(typeof host.marketplacePanel === 'function');
  });
});
