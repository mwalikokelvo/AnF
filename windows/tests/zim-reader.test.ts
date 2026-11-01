import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveZimProtocolUrl,
  extractZimArticleText,
  createMockZimArchive,
  createZimReader,
  ZIM_MAGIC,
} from '../src/workspace/zim-reader.js';

describe('OpenZIM Knowledge Archive & Virtual Protocol Routing', () => {
  it('resolveZimProtocolUrl extracts archive name and entry path correctly', () => {
    const res1 = resolveZimProtocolUrl('zim://wikipedia/A/Thermodynamics');
    assert.deepEqual(res1, {
      archiveName: 'wikipedia',
      entryPath: 'A/Thermodynamics',
    });

    const res2 = resolveZimProtocolUrl('zim://gutenberg/book123.html');
    assert.deepEqual(res2, {
      archiveName: 'gutenberg',
      entryPath: 'book123.html',
    });

    const res3 = resolveZimProtocolUrl('zim://physics');
    assert.deepEqual(res3, {
      archiveName: 'physics',
      entryPath: '',
    });

    assert.equal(resolveZimProtocolUrl('https://wikipedia.org'), null);
    assert.equal(resolveZimProtocolUrl('file:///path/to/archive.zim'), null);
    assert.equal(resolveZimProtocolUrl(''), null);
  });

  it('extractZimArticleText cleans HTML tags, scripts, and entities into plain text', () => {
    const htmlData = new TextEncoder().encode(
      '<html><head><style>body { color: red; }</style><script>alert(1);</script></head><body><h1>Entropy &amp; Energy</h1><p>Thermodynamics deals with heat &lt;temperature&gt; &quot;work&quot;.</p></body></html>'
    );
    const cleaned = extractZimArticleText({
      mimeType: 'text/html',
      data: htmlData,
      title: 'Entropy',
    });

    assert.ok(!cleaned.includes('<script>'));
    assert.ok(!cleaned.includes('body { color: red; }'));
    assert.ok(!cleaned.includes('<h1>'));
    assert.ok(cleaned.includes('Entropy & Energy'));
    assert.ok(cleaned.includes('Thermodynamics deals with heat <temperature> "work".'));
  });

  it('createMockZimArchive produces binary buffer with valid 80-byte ZIM header', () => {
    const buffer = createMockZimArchive({
      uuid: '11223344556677889900aabbccddeeff',
      mainPage: 'A/Index',
      articles: [
        {
          url: 'A/Index',
          title: 'Index',
          mimeType: 'text/html',
          content: '<h1>Index</h1>',
        },
      ],
    });

    assert.ok(buffer.byteLength >= 80);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    assert.equal(view.getUint32(0, true), ZIM_MAGIC);
    assert.equal(view.getUint16(4, true), 5); // major version
    assert.equal(view.getUint32(24, true), 1); // article count
  });

  it('ZimReader opens archive, resolves articles, and supports zim:// routing', async () => {
    const archiveBuffer = createMockZimArchive({
      uuid: 'fedcba9876543210fedcba9876543210',
      mainPage: 'A/Welcome',
      articles: [
        {
          url: 'A/Welcome',
          title: 'Welcome',
          mimeType: 'text/html',
          content: '<html><body><h1>Welcome</h1><p>Offline Encyclopedia</p></body></html>',
        },
        {
          url: 'A/Relativity',
          title: 'Theory of Relativity',
          mimeType: 'text/html',
          content: '<html><body><h1>Relativity</h1><p>Spacetime curvature.</p></body></html>',
        },
      ],
    });

    const reader = createZimReader();
    const meta = await reader.openArchive(archiveBuffer);

    assert.equal(meta.articleCount, 2);
    assert.equal(meta.mainPageUrl, 'A/Welcome');

    // Read by relative path
    const article1 = await reader.readArticle('A/Welcome');
    assert.equal(article1.title, 'Welcome');
    assert.equal(article1.mimeType, 'text/html');
    assert.ok(new TextDecoder().decode(article1.data).includes('Offline Encyclopedia'));

    // Read via zim:// virtual protocol URL
    const article2 = await reader.readArticle('zim://science/A/Relativity');
    assert.equal(article2.title, 'Theory of Relativity');
    assert.ok(new TextDecoder().decode(article2.data).includes('Spacetime curvature.'));

    // Searching titles
    const searchHits = await reader.searchTitles('relativity', 5);
    assert.equal(searchHits.length, 1);
    assert.equal(searchHits[0].title, 'Theory of Relativity');
    assert.ok(searchHits[0].sizeBytes > 0);

    // Error on non-existent article
    await assert.rejects(async () => {
      await reader.readArticle('A/Non_Existent');
    }, /Article not found in ZIM archive/);
  });

  it('ZimReader rejects malformed or truncated archive buffers', async () => {
    const reader = createZimReader();

    // Less than 80 bytes
    await assert.rejects(async () => {
      await reader.openArchive(new Uint8Array(40));
    }, /File size less than 80-byte header/);

    // Invalid magic bytes
    const badMagic = new Uint8Array(100);
    await assert.rejects(async () => {
      await reader.openArchive(badMagic);
    }, /Invalid ZIM magic bytes/);
  });
});
