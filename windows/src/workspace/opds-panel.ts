import { h } from '../views/dom';
import { hasSafeFetch, safeFetchDocument, safeFetchText } from './safe-fetch';
import {
  traverseOpds,
  type OpdsBook,
} from './opds-client';

const CATALOG_KEY = 'anf-opds-catalog-urls';
const ALLOW_KEY = 'anf-opds-catalog-online';
const ALLOW_OFF = 'Allow catalog requests is off. Turn it on to contact OPDS catalogs on the internet.';
const MAX_PAGES = 5;

export interface OpdsPanelOptions {
  notify: (message: string) => void;
  allowed?: () => boolean;
  openUrl: (url: string) => Promise<void>;
  addSource?: (url: string) => Promise<void>;
  /** Ingest downloaded book bytes through the same path as the file picker (desktop OPDS). */
  importBytes?: (fileName: string, bytes: ArrayBuffer) => Promise<void>;
}

function catalogUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    if (u.username || u.password) return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

export function readOpdsCatalogUrls(text: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of value) {
    const url = catalogUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function writeOpdsCatalogUrls(urls: readonly string[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const item of urls) {
    const url = catalogUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    kept.push(url);
  }
  return JSON.stringify(kept);
}

function catalogRequestsEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ALLOW_KEY) === '1';
  } catch {
    return false;
  }
}

function setCatalogRequests(on: boolean): void {
  try {
    localStorage.setItem(ALLOW_KEY, on ? '1' : '0');
  } catch { /* session only */ }
}

async function fetchCatalogText(url: string): Promise<string> {
  if (!catalogRequestsEnabled()) throw new Error(ALLOW_OFF);
  if (hasSafeFetch()) {
    return (await safeFetchText(url, 'feed')).body;
  }
  const response = await fetch(url, { headers: { Accept: 'application/atom+xml, application/xml, application/json, */*' } });
  if (!response.ok) throw new Error(`Catalog returned ${response.status}.`);
  return response.text();
}

export function isEpubAcquisition(book: OpdsBook, url: string): boolean {
  const type = book.acquisitionType?.toLowerCase() ?? '';
  if (type.includes('epub')) return true;
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith('.epub');
  } catch {
    return url.toLowerCase().includes('.epub');
  }
}

export function isPdfAcquisition(book: OpdsBook, url: string): boolean {
  const type = book.acquisitionType?.toLowerCase() ?? '';
  if (type.includes('pdf')) return true;
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return url.toLowerCase().includes('.pdf');
  }
}

export function shouldDownloadBookViaSafeFetch(book: OpdsBook, url: string, desktopSafeFetch: boolean): boolean {
  return desktopSafeFetch && (isEpubAcquisition(book, url) || isPdfAcquisition(book, url));
}

export function acquisitionMime(book: OpdsBook, url: string): string {
  if (isPdfAcquisition(book, url)) return 'application/pdf';
  return 'application/epub+zip';
}

export function suggestAcquisitionFileName(book: OpdsBook, url: string): string {
  try {
    const base = new URL(url).pathname.split('/').pop() ?? '';
    if (/\.(epub|pdf)$/i.test(base)) return decodeURIComponent(base);
  } catch { /* use title below */ }
  const stem = (book.title || book.id || 'book').replace(/[^\w\s.-]+/g, '').trim().slice(0, 80) || 'book';
  return `${stem}${isPdfAcquisition(book, url) ? '.pdf' : '.epub'}`;
}

function isEpub(book: OpdsBook, url: string): boolean {
  return isEpubAcquisition(book, url);
}

function isHtmlAcquisition(book: OpdsBook, url: string): boolean {
  const type = book.acquisitionType?.toLowerCase() ?? '';
  if (type.includes('html')) return true;
  return /\.html?(?:$|[?#])/i.test(url);
}

export function createOpdsPanel(opts: OpdsPanelOptions) {
  const allowBox = h('input', { type: 'checkbox', 'aria-label': 'Allow catalog requests' }) as HTMLInputElement;
  const allowHint = h('p', { class: 'hint', text: 'Off · OPDS catalogs are not contacted.' });
  const catalogInput = h('input', {
    type: 'url',
    placeholder: 'https://example.org/opds',
    'aria-label': 'OPDS catalog address',
  }) as HTMLInputElement;
  const catalogList = h('ul', { class: 'opds-catalog-list' });
  const bookList = h('div', { class: 'opds-book-list' });
  const browseStatus = h('p', { class: 'hint', role: 'status', text: '' });

  let catalogs: string[] = [];
  let busy = false;

  function paintAllow() {
    allowHint.textContent = allowBox.checked
      ? 'On · Browse contacts the catalog URL you choose. Book covers are not loaded unless already in the feed.'
      : 'Off · OPDS catalogs are not contacted.';
  }

  function loadCatalogs() {
    try {
      catalogs = readOpdsCatalogUrls(localStorage.getItem(CATALOG_KEY) || '[]');
    } catch {
      catalogs = [];
    }
    renderCatalogs();
  }

  function saveCatalogs() {
    try {
      localStorage.setItem(CATALOG_KEY, writeOpdsCatalogUrls(catalogs));
    } catch {
      opts.notify('Could not save catalog list.');
    }
    renderCatalogs();
  }

  function renderCatalogs() {
    catalogList.replaceChildren(...catalogs.map((url) => {
      const row = h('li', { class: 'row' }, h('span', { class: 'hint', text: url }));
      const browse = h('button', { type: 'button', text: 'Browse' });
      browse.addEventListener('click', () => void browseCatalog(url));
      const remove = h('button', { type: 'button', text: 'Remove' });
      remove.addEventListener('click', () => {
        catalogs = catalogs.filter((item) => item !== url);
        saveCatalogs();
        opts.notify('Catalog removed.');
      });
      row.append(browse, remove);
      return row;
    }));
  }

  function renderBooks(books: OpdsBook[], stopped: string, pages: number) {
    browseStatus.textContent = books.length
      ? `Showing ${books.length} title${books.length === 1 ? '' : 's'} from ${pages} catalog page${pages === 1 ? '' : 's'} (${stopped}).`
      : `No books found (${stopped}).`;
    bookList.replaceChildren(...books.map((book) => {
      const open = h('button', { type: 'button', text: 'Open link' });
      open.disabled = !book.acquisitionUrl;
      open.addEventListener('click', () => void openAcquisition(book));
      return h('article', { class: 'source' },
        h('h3', { text: book.title || book.id }),
        book.acquisitionUrl ? h('p', { class: 'hint', text: book.acquisitionUrl }) : h('p', { class: 'hint', text: 'No acquisition link in this entry.' }),
        h('div', { class: 'row' }, open),
      );
    }));
  }

  async function openAcquisition(book: OpdsBook) {
    const url = book.acquisitionUrl;
    if (!url) {
      opts.notify('This entry has no download link.');
      return;
    }
    if (opts.addSource && isHtmlAcquisition(book, url)) {
      await opts.addSource(url);
      opts.notify('Web page added as a document source.');
      return;
    }
    if (opts.importBytes && shouldDownloadBookViaSafeFetch(book, url, hasSafeFetch())) {
      const blob = await safeFetchDocument(url, acquisitionMime(book, url));
      await opts.importBytes(suggestAcquisitionFileName(book, url), await blob.arrayBuffer());
      opts.notify('Book added as a document source.');
      return;
    }
    if (isEpub(book, url)) {
      await opts.openUrl(url);
      opts.notify('EPUB link opened in your browser. Download the file from there, then add it as a document in this section.');
      return;
    }
    await opts.openUrl(url);
    opts.notify('Link opened in your browser.');
  }

  async function browseCatalog(url: string) {
    if (busy || opts.allowed?.() === false) return;
    if (!catalogRequestsEnabled()) {
      opts.notify(ALLOW_OFF);
      return;
    }
    busy = true;
    browseStatus.textContent = 'Loading catalog…';
    bookList.replaceChildren();
    const controls = [allowBox, catalogInput, ...catalogList.querySelectorAll('button')];
    controls.forEach((el) => { (el as HTMLButtonElement).disabled = true; });
    try {
      const result = await traverseOpds(url, fetchCatalogText, { maxPages: MAX_PAGES });
      renderBooks(result.books, result.stopped, result.pages);
    } catch (err) {
      browseStatus.textContent = String(err).replace(/^Error: /, '');
      opts.notify(browseStatus.textContent);
    } finally {
      busy = false;
      controls.forEach((el) => { (el as HTMLButtonElement).disabled = false; });
    }
  }

  allowBox.checked = catalogRequestsEnabled();
  paintAllow();
  allowBox.addEventListener('change', () => {
    setCatalogRequests(allowBox.checked);
    paintAllow();
  });

  const addCatalog = h('button', { type: 'button', text: 'Add catalog' });
  addCatalog.addEventListener('click', () => {
    const url = catalogUrl(catalogInput.value.trim());
    if (!url) {
      opts.notify('Enter a plain http(s) catalog URL.');
      return;
    }
    if (!catalogs.includes(url)) catalogs.push(url);
    catalogInput.value = '';
    saveCatalogs();
    opts.notify('Catalog saved.');
  });

  loadCatalogs();

  const root = h('details', { class: 'opds-panel' },
    h('summary', { text: 'OPDS catalogs' }),
    h('p', { class: 'hint', text: 'Subscribe to public OPDS catalogs, browse titles, and open acquisition links. Catalog requests leave this device when allowed below.' }),
    h('label', { class: 'check-row' }, allowBox, ' Allow catalog requests'),
    allowHint,
    h('div', { class: 'row' }, catalogInput, addCatalog),
    catalogList,
    browseStatus,
    bookList,
  );

  return { root, reload: loadCatalogs };
}
