import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ChatwootInboxManager } from '../src/workspace/chatwoot-inbox.js';

describe('Chatwoot Support & Community Inbox Integration', () => {
  test('ChatwootInboxManager initializes and lists conversations with status filters', () => {
    const manager = new ChatwootInboxManager();
    const all = manager.listConversations();
    assert.ok(all.length >= 2);

    const openList = manager.listConversations('open');
    assert.ok(openList.every(c => c.status === 'open'));

    const resolvedList = manager.listConversations('resolved');
    assert.ok(resolvedList.every(c => c.status === 'resolved'));
  });

  test('createConversation creates new open thread with initial message', () => {
    const manager = new ChatwootInboxManager();
    const convo = manager.createConversation({
      contactName: 'Amara Chen',
      contactEmail: 'amara@example.org',
      channel: 'feedback',
      subject: 'Offline sync across local LAN',
      initialMessage: 'Can AnF sync without internet over local Wi-Fi?',
      tags: ['sync', 'offline'],
    });

    assert.ok(convo.id.startsWith('cw-'));
    assert.equal(convo.contactName, 'Amara Chen');
    assert.equal(convo.status, 'open');
    assert.equal(convo.messages.length, 1);
    assert.equal(convo.messages[0].sender, 'contact');
    assert.equal(convo.messages[0].text, 'Can AnF sync without internet over local Wi-Fi?');

    const found = manager.getConversation(convo.id);
    assert.ok(found);
    assert.equal(found.subject, 'Offline sync across local LAN');
  });

  test('replyToConversation appends message and updates conversation status', () => {
    const manager = new ChatwootInboxManager();
    const convo = manager.createConversation({
      contactName: 'Liam O’Connor',
      subject: 'Audio clipping question',
      initialMessage: 'How do I export a 30s audio clip in Audio Studio?',
    });

    const reply = manager.replyToConversation(convo.id, 'Use the Export Clip action in Audio Studio with your desired duration.');
    assert.equal(reply.sender, 'agent');
    assert.ok(convo.messages.length >= 2);
    assert.equal(convo.status, 'pending');

    manager.updateStatus(convo.id, 'resolved');
    assert.equal(manager.getConversation(convo.id)?.status, 'resolved');
  });

  test('exportToMarkdown creates complete Markdown conversation log with frontmatter', () => {
    const manager = new ChatwootInboxManager();
    const convo = manager.listConversations()[0];
    const md = manager.exportToMarkdown(convo.id);

    assert.ok(md.startsWith('---'));
    assert.ok(md.includes('type: support-thread'));
    assert.ok(md.includes(`id: "${convo.id}"`));
    assert.ok(md.includes(`contact: "${convo.contactName}"`));
    assert.ok(md.includes(`# ${convo.subject}`));
    assert.ok(md.includes('## Transcript'));
  });

  test('replyToConversation and updateStatus throw on invalid conversation ID', () => {
    const manager = new ChatwootInboxManager();
    assert.throws(() => manager.replyToConversation('cw-invalid', 'Hello'), /Conversation cw-invalid not found/);
    assert.throws(() => manager.updateStatus('cw-invalid', 'resolved'), /Conversation cw-invalid not found/);
  });
});
