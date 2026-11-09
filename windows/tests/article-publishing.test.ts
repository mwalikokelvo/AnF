import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrontmatter,
  serializeFrontmatter,
  exportArticleHtml,
  exportArticleRss,
  addToReadingQueue,
  updateQueueProgress,
  removeFromReadingQueue,
  auditSeo,
  type Article,
  type ReadingQueueItem
} from '../src/workspace/article-publishing.js';

describe('Substack Publishing Desk & Frontmatter Authoring', () => {
  test('parseFrontmatter extracts YAML frontmatter header and separates body', () => {
    const raw = `---
title: "The Sovereign Writer"
subtitle: "An Architectural Blueprint"
author: "Antigravity Team"
date: 2026-10-31
tags: ["local-first", "offline", "publishing"]
audience: subscribers
canonicalUrl: "https://anf.substack.com/p/sovereign-writer"
---

# Introduction

This is the body of the article.
Second paragraph with **bold** concepts.`;

    const { metadata, body } = parseFrontmatter(raw);
    assert.equal(metadata.title, 'The Sovereign Writer');
    assert.equal(metadata.subtitle, 'An Architectural Blueprint');
    assert.equal(metadata.author, 'Antigravity Team');
    assert.equal(metadata.date, '2026-10-31');
    assert.deepEqual(metadata.tags, ['local-first', 'offline', 'publishing']);
    assert.equal(metadata.audience, 'subscribers');
    assert.equal(metadata.canonicalUrl, 'https://anf.substack.com/p/sovereign-writer');
    assert.ok(body.startsWith('# Introduction'));
    assert.ok(body.includes('Second paragraph'));
  });

  test('parseFrontmatter extracts first markdown heading when no YAML header present', () => {
    const raw = `# The Independent Mind\n\nExploring depth in writing without platform capture.`;
    const { metadata, body } = parseFrontmatter(raw);
    assert.equal(metadata.title, 'The Independent Mind');
    assert.equal(body, raw);
  });

  test('serializeFrontmatter creates valid frontmatter header matching parsed values', () => {
    const meta = {
      title: 'Crafting Offline Systems',
      subtitle: 'Lessons from AnF',
      author: 'Senior Dev',
      date: '2026-10-30',
      audience: 'everyone' as const,
      tags: ['software', 'architecture']
    };
    const body = 'Core architectural insights.';
    const serialized = serializeFrontmatter(meta, body);
    assert.ok(serialized.startsWith('---'));
    assert.ok(serialized.includes('title: "Crafting Offline Systems"'));
    assert.ok(serialized.includes('subtitle: "Lessons from AnF"'));
    assert.ok(serialized.includes('tags: ["software", "architecture"]'));
    assert.ok(serialized.endsWith(body));

    const roundTrip = parseFrontmatter(serialized);
    assert.equal(roundTrip.metadata.title, meta.title);
    assert.equal(roundTrip.metadata.subtitle, meta.subtitle);
    assert.deepEqual(roundTrip.metadata.tags, meta.tags);
    assert.equal(roundTrip.body.trim(), body);
  });

  test('exportArticleHtml produces clean standalone HTML with semantic markup', () => {
    const article: Article = {
      id: 'art-001',
      metadata: {
        title: 'Deep Focus & Local Storage',
        subtitle: 'Preserving agency in modern software',
        author: 'Lead Architect',
        date: '2026-10-31',
        tags: ['offline', 'privacy']
      },
      markdown: '# Core Thesis\n\n> The best code is the code never written.\n\nHere is some code:\n```\nconst x = 42;\n```\n\nFinal thoughts with **conviction**.',
      updatedAt: Date.now()
    };

    const html = exportArticleHtml(article);
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('<title>Deep Focus &amp; Local Storage</title>'));
    assert.ok(html.includes('<h1>Core Thesis</h1>'));
    assert.ok(html.includes('<blockquote><p>The best code is the code never written.</p></blockquote>'));
    assert.ok(html.includes('<pre><code>const x = 42;</code></pre>'));
    assert.ok(html.includes('<strong>conviction</strong>'));
    assert.ok(html.includes('<span class="article-tag">offline</span>'));
  });

  test('exportArticleRss generates standard RSS 2.0 XML with CDATA descriptions', () => {
    const articles: Article[] = [
      {
        id: 'rss-1',
        metadata: {
          title: 'Article One',
          author: 'Author A',
          date: '2026-10-30T12:00:00Z',
          canonicalUrl: 'https://example.com/p/1'
        },
        markdown: 'Content for article one.',
        updatedAt: 1730300000000
      },
      {
        id: 'rss-2',
        metadata: {
          title: 'Article Two <Special>',
          author: 'Author B',
          date: '2026-10-31T08:00:00Z'
        },
        markdown: 'Content for article two with <raw> tags.',
        updatedAt: 1730350000000
      }
    ];

    const channel = {
      title: 'AnF Dispatch',
      link: 'https://example.com',
      description: 'Dispatches from the offline workspace'
    };

    const rss = exportArticleRss(channel, articles);
    assert.ok(rss.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(rss.includes('<rss version="2.0"'));
    assert.ok(rss.includes('<title>AnF Dispatch</title>'));
    assert.ok(rss.includes('<item>'));
    assert.ok(rss.includes('<title>Article One</title>'));
    assert.ok(rss.includes('<title>Article Two &lt;Special&gt;</title>'));
    assert.ok(rss.includes('<![CDATA[Content for article two with <raw> tags.]]>'));
    assert.ok(rss.includes('</channel>'));
    assert.ok(rss.includes('</rss>'));
  });
});

describe('Reading Queue Lifecycle', () => {
  let queue: ReadingQueueItem[] = [];

  beforeEach(() => {
    queue = [];
  });

  test('addToReadingQueue appends new item with word-count estimation and prevents duplicates', () => {
    const item1 = {
      title: 'Long Essay on Systems',
      source: 'Substack: Systems Design',
      text: 'Word '.repeat(440), // 440 words ~ 2 minutes
      url: 'https://substack.com/p/systems'
    };

    queue = addToReadingQueue(queue, item1);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].title, 'Long Essay on Systems');
    assert.equal(queue[0].estimatedMinutes, 2);
    assert.equal(queue[0].progress, 0);

    // Adding duplicate by URL is a no-op
    queue = addToReadingQueue(queue, item1);
    assert.equal(queue.length, 1);
  });

  test('updateQueueProgress clamps progress and sets readAt timestamp upon 100% completion', () => {
    const item = {
      title: 'Short Article',
      source: 'Local Notes',
      text: 'Quick reading sample.',
    };
    queue = addToReadingQueue(queue, item);
    const id = queue[0].id;

    queue = updateQueueProgress(queue, id, 0.5);
    assert.equal(queue[0].progress, 0.5);
    assert.equal(queue[0].readAt, undefined);

    queue = updateQueueProgress(queue, id, 1.0);
    assert.equal(queue[0].progress, 1.0);
    assert.ok(typeof queue[0].readAt === 'number');

    // Over-boundary clamping
    queue = updateQueueProgress(queue, id, 1.5);
    assert.equal(queue[0].progress, 1.0);
  });

  test('removeFromReadingQueue removes matching entry', () => {
    queue = addToReadingQueue(queue, { title: 'Keep Item', source: 'Source', text: 'Text' });
    queue = addToReadingQueue(queue, { title: 'Delete Item', source: 'Source', text: 'Text' });
    assert.equal(queue.length, 2);

    const deleteId = queue.find(q => q.title === 'Delete Item')!.id;
    queue = removeFromReadingQueue(queue, deleteId);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].title, 'Keep Item');
  });

  test('exportArticleHtml includes Open Graph and Twitter Card metadata', () => {
    const article: Article = {
      id: 'art-seo-001',
      metadata: {
        title: 'Exploring Local-First Architecture',
        subtitle: 'A guide to private computing and data ownership',
        canonicalUrl: 'https://example.com/p/local-first',
        coverImageUrl: 'https://example.com/cover.png',
      },
      markdown: '# Introduction\n\nDeep thoughts on local computing.',
      updatedAt: 1700000000000,
    };
    const html = exportArticleHtml(article);
    assert.ok(html.includes('<meta property="og:title" content="Exploring Local-First Architecture">'));
    assert.ok(html.includes('<meta property="og:description" content="A guide to private computing and data ownership">'));
    assert.ok(html.includes('<meta property="og:type" content="article">'));
    assert.ok(html.includes('<meta property="og:url" content="https://example.com/p/local-first">'));
    assert.ok(html.includes('<meta property="og:image" content="https://example.com/cover.png">'));
    assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
  });

  test('auditSeo computes SEO score and reports actionable suggestions', () => {
    const draft = `---
title: "The Comprehensive Guide to Private Offline-First Applications"
subtitle: "How to build reliable desktop software without central server dependencies or cloud surveillance"
tags: [privacy, local-first]
---

## Why Local-First Matters

Modern users demand privacy and instant responsiveness that cloud-tethered apps cannot guarantee.
Here is an illustration of architecture:
![Architecture diagram](https://example.com/arch.png)

## Core Architectural Principles

When design decisions align with local databases like SQLite or IndexedDB, durability becomes trivial.
Everything syncs over peer-to-peer protocols without trusted intermediaries.
`;
    const res = auditSeo(draft);
    assert.ok(res.score >= 80, `Expected score >= 80, got ${res.score}`);
    assert.equal(res.titleStatus, 'good');
    assert.equal(res.descriptionStatus, 'good');
    assert.equal(res.imagesTotal, 1);
    assert.equal(res.imagesWithAlt, 1);
    assert.equal(res.imagesStatus, 'good');
  });

  test('auditSeo flags missing title, missing description, and images without alt text', () => {
    const draft = `Some text without frontmatter or heading.
![ ](https://example.com/empty-alt.jpg)
`;
    const res = auditSeo(draft);
    assert.ok(res.score < 50, `Expected score < 50 for poor draft, got ${res.score}`);
    assert.equal(res.titleStatus, 'error');
    assert.equal(res.descriptionStatus, 'warning');
    assert.equal(res.imagesTotal, 1);
    assert.equal(res.imagesWithAlt, 0);
    assert.equal(res.imagesStatus, 'warning');
    assert.ok(res.suggestions.some(s => s.includes('title')));
    assert.ok(res.suggestions.some(s => s.includes('alt text')));
  });
});
