import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRtf,
  parseFb2,
  parseCbzManifest,
  parseDocxDocumentXml,
  parseOdtContentXml,
  parseMobiRecordText,
  parseWebDocHtml,
  convertBookFormat
} from '../src/workspace/reader/formats/book-formats.js';
import { FsrsScheduler } from '../src/workspace/reader/formats/fsrs-scheduler.js';

describe('Cross-Ported ThingsBook Multi-Format Book Reader & FSRS (AnF)', () => {
  test('parseRtf extracts text, info title, author and strips formatting commands', () => {
    const rtf = `{\\rtf1\\ansi{\\info{\\title The Time Machine}{\\author H.G. Wells}}\\par\\b The Time Traveller\\b0 was expounding a recondite matter to us.\\par}`;
    const result = parseRtf(rtf);

    assert.equal(result.format, 'RTF');
    assert.equal(result.title, 'The Time Machine');
    assert.deepEqual(result.authors, ['H.G. Wells']);
    assert.ok(result.text.includes('The Time Traveller was expounding'));
    assert.ok(!result.text.includes('\\b0'));
  });

  test('parseFb2 parses FictionBook2 XML metadata, authors and chapter sections', () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <book-title>War and Peace</book-title>
      <author><first-name>Leo</first-name><last-name>Tolstoy</last-name></author>
      <annotation><p>Epic historical novel.</p></annotation>
    </title-info>
  </description>
  <body>
    <section>
      <title><p>Chapter 1</p></title>
      <p>Well, Prince, so Genoa and Lucca are now just family estates of the Buonapartes.</p>
    </section>
  </body>
</FictionBook>`;

    const result = parseFb2(fb2);
    assert.equal(result.format, 'FB2');
    assert.equal(result.title, 'War and Peace');
    assert.deepEqual(result.authors, ['Leo Tolstoy']);
    assert.ok(result.text.includes('Chapter 1'));
    assert.ok(result.text.includes('Well, Prince, so Genoa'));
    assert.equal(result.sections.length, 1);
  });

  test('parseCbzManifest sorts page images naturally and extracts ComicInfo metadata', () => {
    const files = [
      'page_10.jpg',
      'page_1.jpg',
      'page_2.jpg',
      'ComicInfo.xml'
    ];
    const comicInfo = `<ComicInfo><Title>The Dark Knight</Title><Series>Batman</Series><Number>1</Number><Writer>Frank Miller</Writer></ComicInfo>`;

    const result = parseCbzManifest(files, comicInfo);
    assert.equal(result.format, 'CBZ');
    assert.equal(result.title, 'The Dark Knight');
    assert.deepEqual(result.authors, ['Frank Miller']);

    // Natural sort check: page_1 -> page_2 -> page_10
    const pages = (result.metadata as any).pages;
    assert.deepEqual(pages, ['page_1.jpg', 'page_2.jpg', 'page_10.jpg']);
    assert.equal(result.sections.length, 3);
  });

  test('parseDocxDocumentXml extracts paragraphs and title', () => {
    const docxXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Project Architecture Specification</w:t></w:r></w:p>
    <w:p><w:r><w:t>This document outlines the core principles.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const result = parseDocxDocumentXml(docxXml);
    assert.equal(result.format, 'DOCX');
    assert.equal(result.title, 'Project Architecture Specification');
    assert.ok(result.text.includes('core principles'));
  });

  test('parseOdtContentXml extracts open document paragraphs', () => {
    const odtXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body>
    <office:text>
      <text:h text:outline-level="1">Open Standards</text:h>
      <text:p>OpenDocument Format enables long-term preservation.</text:p>
    </office:text>
  </office:body>
</office:document-content>`;

    const result = parseOdtContentXml(odtXml);
    assert.equal(result.format, 'ODT');
    assert.equal(result.title, 'Open Standards');
    assert.ok(result.text.includes('long-term preservation'));
  });

  test('parseMobiRecordText extracts title and readable text stream', () => {
    const mobi = `<html><head><title>Treasure Island</title></head><body><p>Squire Trelawney, Dr. Livesey, and the rest of these gentlemen having asked me to write down the whole particulars...</p></body></html>`;
    const result = parseMobiRecordText(mobi);

    assert.equal(result.format, 'MOBI');
    assert.equal(result.title, 'Treasure Island');
    assert.ok(result.text.includes('Squire Trelawney'));
  });

  test('parseWebDocHtml extracts clean article body and strips script/style tags', () => {
    const html = `<html><head><title>Web Article</title><style>.hidden{display:none;}</style><script>alert(1);</script></head><body><header>Site Header</header><p>The main article text is preserved cleanly.</p><footer>Site Footer</footer></body></html>`;
    const result = parseWebDocHtml(html);

    assert.equal(result.format, 'WEBDOC');
    assert.equal(result.title, 'Web Article');
    assert.ok(result.text.includes('main article text is preserved cleanly'));
    assert.ok(!result.text.includes('Site Header'));
    assert.ok(!result.text.includes('alert(1)'));
  });

  test('convertBookFormat routes by file extension accurately', () => {
    const r1 = convertBookFormat('document.rtf', '{\\rtf1 Plain text}');
    assert.equal(r1.format, 'RTF');

    const r2 = convertBookFormat('story.fb2', '<FictionBook><description><title-info><book-title>Test</book-title></title-info></description><body><p>Hello</p></body></FictionBook>');
    assert.equal(r2.format, 'FB2');

    const r3 = convertBookFormat('archive.mhtml', '<html><head><title>Page</title></head><body><p>Content</p></body></html>');
    assert.equal(r3.format, 'WEBDOC');
  });

  test('FsrsScheduler schedules card reviews, updates stability and computes retrievability', () => {
    const scheduler = new FsrsScheduler(0.9);
    const card = scheduler.createCard('What is the capital of Japan?', 'Tokyo', 'Geography 101');

    assert.equal(card.state, 'New');
    assert.equal(card.reps, 0);

    // Initial review: Good
    const res1 = scheduler.reviewCard(card, 'Good');
    assert.equal(res1.card.state, 'Review');
    assert.equal(res1.card.reps, 1);
    assert.ok(res1.nextIntervalDays >= 3);

    // After 1 day, retrievability is high
    const r1 = scheduler.computeRetrievability(res1.card, Date.now() + 86400000);
    assert.ok(r1 >= 0.85);

    // Review with "Again" causes lapse and moves to Relearning
    const res2 = scheduler.reviewCard(res1.card, 'Again');
    assert.equal(res2.card.lapses, 1);
    assert.equal(res2.card.state, 'Relearning');
    assert.equal(res2.nextIntervalDays, 1);
  });
});
