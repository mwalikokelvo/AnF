/**
 * Kevo Safety & Approval Tests (Phase 2 Step 2.8).
 * Verifies that uncensored local models cannot bypass confirmation for risky actions:
 * - Deleting files
 * - Sending messages
 * - Payments
 * - System settings
 * Every risky action must ask first and cannot execute without explicit owner approval.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisVoiceAgent, type PendingApproval } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { KEVO_ACTIONS, getActionByName } from '../src/workspace/jarvis/voice/kevo-actions';

describe('Kevo Safety: Risky Action Approval Gates', () => {
  const riskyActionTypes = [
    { action: 'delete_file', summary: 'Delete file draft.md', desc: 'deleting files' },
    { action: 'send_message', summary: 'Send email to team', desc: 'sending messages' },
    { action: 'payment_transfer', summary: 'Authorize payment of $50', desc: 'payments' },
    { action: 'modify_system_setting', summary: 'Change network proxy settings', desc: 'system settings' },
  ];

  for (const { action, summary, desc } of riskyActionTypes) {
    it(`requires explicit approval before ${desc} (${action})`, async () => {
      let executed = false;
      let recordedApproval: { id: number | string; approved: boolean } | null = null;

      const agent = new JarvisVoiceAgent({
        switchView: () => {},
        answerApproval: async (id, approved) => {
          recordedApproval = { id, approved };
          if (approved) {
            executed = true;
          }
        },
      });

      // 1. Without an active approval card, speaking "yes" or "go ahead" must NOT execute anything
      const unaskedRes = await agent.processVoiceInput('yes');
      assert.notEqual(unaskedRes.actionName, 'approval_approved');
      assert.equal(executed, false, `Must not execute ${action} without an active approval request`);
      assert.equal(recordedApproval, null);

      // 2. Set the pending approval card for the risky action (asking first)
      const approvalCard: PendingApproval = {
        id: `test-${action}-1`,
        action,
        summary,
        answer: (approved: boolean) => {
          recordedApproval = { id: `test-${action}-1`, approved };
          if (approved) executed = true;
        },
      };
      agent.setPendingApproval(approvalCard);
      assert.equal(agent.getPendingApproval()?.action, action);

      // 3. User rejects / cancels: the risky action is denied and must NOT execute
      const denyRes = await agent.processVoiceInput('cancel');
      assert.equal(denyRes.handled, true);
      assert.equal(denyRes.actionName, 'approval_denied');
      assert.equal(recordedApproval?.approved, false);
      assert.equal(executed, false, `Denied ${action} must not execute`);
      assert.equal(agent.getPendingApproval(), null, 'Approval must be cleared after denial');

      // 4. Set approval again and test affirmative confirmation
      recordedApproval = null;
      executed = false;
      agent.setPendingApproval(approvalCard);

      const approveRes = await agent.processVoiceInput('approve');
      assert.equal(approveRes.handled, true);
      assert.equal(approveRes.actionName, 'approval_approved');
      assert.equal(recordedApproval?.approved, true);
      assert.equal(executed, true, `Approved ${action} executes only after explicit consent`);
      assert.equal(agent.getPendingApproval(), null, 'Approval must be cleared after approval');
    });
  }

  it('safeguards against model tool calling exposing unconfirmed destructive tools', () => {
    // Uncensored models have access only to registered KEVO_ACTIONS.
    // Ensure no unconfirmed destructive actions (raw file deletion, payments, shell execution) exist as bare unconfirmed tools.
    const allActionNames = KEVO_ACTIONS.map((a) => a.name);

    assert.equal(getActionByName('delete_file'), undefined, 'No unvetted delete_file tool in bare action catalog');
    assert.equal(getActionByName('rm_rf'), undefined, 'No rm_rf tool');
    assert.equal(getActionByName('send_message'), undefined, 'No unvetted send_message tool in bare action catalog');
    assert.equal(getActionByName('make_payment'), undefined, 'No unvetted payment tool in bare action catalog');
    assert.equal(getActionByName('change_system_setting'), undefined, 'No unvetted system setting tool in bare action catalog');

    // Available tools are safe and inspected
    for (const action of KEVO_ACTIONS) {
      assert.ok(action.name, 'Action must have a name');
      assert.ok(action.description, 'Action must have a description');
      assert.ok(action.parameters, 'Action must define parameters');
    }
  });

  it('defaults to safe denial if pending approval is never affirmatively approved', async () => {
    let executed = false;
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
    });

    agent.setPendingApproval({
      id: 'timeout-test',
      action: 'delete_file',
      summary: 'Delete project documents',
      answer: (approved) => {
        if (approved) executed = true;
      },
    });

    // An unrelated conversational query or unknown response does not approve the risky action
    await agent.processVoiceInput('tell me a joke');
    assert.equal(executed, false, 'Unrelated input must never approve a pending risky action');

    // Explicit denial
    await agent.processVoiceInput('never mind');
    assert.equal(executed, false, 'Denial must never execute the risky action');
  });
});
