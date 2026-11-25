import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  addToShoppingList,
  listShoppingList,
  clearShoppingList,
  removeFromShoppingList,
} from '../src/workspace/jarvis/voice/kevo-shopping';
import { executeKevoAction, getActionByName } from '../src/workspace/jarvis/voice/kevo-actions';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

describe('Kevo shopping list capability', () => {
  beforeEach(() => {
    clearShoppingList();
  });

  it('manages shopping list operations directly', () => {
    assert.match(listShoppingList(), /empty/);
    assert.match(addToShoppingList('milk'), /Added milk/);
    assert.match(addToShoppingList('eggs'), /Added eggs/);
    assert.match(addToShoppingList('milk'), /already on your shopping list/);
    assert.match(listShoppingList(), /milk, eggs/);
    assert.match(removeFromShoppingList('milk'), /Removed milk/);
    assert.doesNotMatch(listShoppingList(), /\bmilk\b/);
    assert.match(removeFromShoppingList('nonexistent'), /was not on your shopping list/);
    assert.match(clearShoppingList(), /Cleared 1 item/);
    assert.match(listShoppingList(), /empty/);
  });

  it('executes shopping list actions via executeKevoAction', async () => {
    const addAction = getActionByName('add_to_shopping_list');
    assert.ok(addAction);

    const addRes = await executeKevoAction('add_to_shopping_list', { item: 'coffee' }, {} as any);
    assert.equal(addRes.handled, true);
    assert.match(addRes.speechReply, /Added coffee/);

    const listRes = await executeKevoAction('list_shopping_list', {}, {} as any);
    assert.equal(listRes.handled, true);
    assert.match(listRes.speechReply, /coffee/);

    const removeRes = await executeKevoAction('remove_from_shopping_list', { item: 'coffee' }, {} as any);
    assert.equal(removeRes.handled, true);
    assert.match(removeRes.speechReply, /Removed coffee/);

    const clearRes = await executeKevoAction('clear_shopping_list', {}, {} as any);
    assert.equal(clearRes.handled, true);
    assert.match(clearRes.speechReply, /Cleared 0 items/);
  });

  it('handles voice instructions via JarvisVoiceAgent', async () => {
    const agent = new JarvisVoiceAgent({ switchView: () => {} });

    const addVoice = await agent.processVoiceInput('add bread to my shopping list');
    assert.equal(addVoice.handled, true);
    assert.equal(addVoice.actionName, 'add_to_shopping_list');
    assert.match(addVoice.speechReply, /Added bread/);

    const listVoice = await agent.processVoiceInput("what's on my shopping list");
    assert.equal(listVoice.handled, true);
    assert.equal(listVoice.actionName, 'list_shopping_list');
    assert.match(listVoice.speechReply, /bread/);

    const removeVoice = await agent.processVoiceInput('remove bread from my shopping list');
    assert.equal(removeVoice.handled, true);
    assert.equal(removeVoice.actionName, 'remove_from_shopping_list');
    assert.match(removeVoice.speechReply, /Removed bread/);

    const clearVoice = await agent.processVoiceInput('clear the shopping list');
    assert.equal(clearVoice.handled, true);
    assert.equal(clearVoice.actionName, 'approval_requested');
    await agent.processVoiceInput('yes');
    assert.match(listShoppingList(), /empty/);
  });
});
