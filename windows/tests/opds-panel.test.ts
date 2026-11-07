import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquisitionMime,
  shouldDownloadBookViaSafeFetch,
  suggestAcquisitionFileName,
} from '../src/workspace/opds-panel.js';
import type { OpdsBook } from '../src/workspace/opds-client.js';

const epubBook: OpdsBook = {
  id: 'urn:book:1',
  title: 'Sample Story',
  acquisitionUrl: 'https://catalog.example.org/books/story.epub',
  acquisitionType: 'application/epub+zip',
};

test('desktop safe fetch is used for epub and pdf acquisition links', () => {
  assert.equal(shouldDownloadBookViaSafeFetch(epubBook, epubBook.acquisitionUrl!, true), true);
  assert.equal(shouldDownloadBookViaSafeFetch(epubBook, epubBook.acquisitionUrl!, false), false);
  const pdf: OpdsBook = {
    ...epubBook,
    acquisitionUrl: 'https://catalog.example.org/guide.pdf',
    acquisitionType: 'application/pdf',
  };
  assert.equal(shouldDownloadBookViaSafeFetch(pdf, pdf.acquisitionUrl!, true), true);
  assert.equal(shouldDownloadBookViaSafeFetch(pdf, pdf.acquisitionUrl!, false), false);
});

test('acquisition mime and filename follow OPDS type and URL', () => {
  assert.equal(acquisitionMime(epubBook, epubBook.acquisitionUrl!), 'application/epub+zip');
  assert.equal(suggestAcquisitionFileName(epubBook, epubBook.acquisitionUrl!), 'story.epub');
  const pdfUrl = 'https://catalog.example.org/files/manual.pdf';
  const pdfBook: OpdsBook = { ...epubBook, acquisitionUrl: pdfUrl, acquisitionType: 'application/pdf' };
  assert.equal(acquisitionMime(pdfBook, pdfUrl), 'application/pdf');
  assert.equal(suggestAcquisitionFileName(pdfBook, pdfUrl), 'manual.pdf');
});
