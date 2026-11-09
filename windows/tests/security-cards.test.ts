import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECURITY_CARDS_DECK,
  evaluateCardAnswer,
  SecurityDeckSession,
} from '../src/workspace/security-cards.js';

describe('Clouds Against Humanity Security & Architecture Cards', () => {
  test('SECURITY_CARDS_DECK contains validated cards with exactly 1 correct option each', () => {
    assert.ok(SECURITY_CARDS_DECK.length >= 5);
    for (const card of SECURITY_CARDS_DECK) {
      assert.ok(card.id.length > 0);
      assert.ok(card.title.length > 0);
      assert.ok(card.scenario.length > 0);
      assert.ok(card.options.length >= 2);
      const correctCount = card.options.filter(o => o.isCorrect).length;
      assert.equal(correctCount, 1, `Card ${card.id} must have exactly one correct option`);
      assert.ok(card.seniorDevRationale.length > 0);
    }
  });

  test('evaluateCardAnswer validates correct and incorrect selections', () => {
    // Correct answer for telemetry
    const resCorrect = evaluateCardAnswer('telemetry-leakage', 'opt-b');
    assert.equal(resCorrect.isCorrect, true);
    assert.equal(resCorrect.scoreDelta, 10);
    assert.ok(resCorrect.explanation.includes('offline-first'));

    // Incorrect answer for telemetry
    const resWrong = evaluateCardAnswer('telemetry-leakage', 'opt-a');
    assert.equal(resWrong.isCorrect, false);
    assert.equal(resWrong.scoreDelta, 0);
    assert.ok(resWrong.explanation.includes('breaches'));
  });

  test('evaluateCardAnswer throws on invalid card or option ID', () => {
    assert.throws(() => evaluateCardAnswer('non-existent-card', 'opt-a'), /Unknown card id/);
    assert.throws(() => evaluateCardAnswer('telemetry-leakage', 'opt-invalid'), /Unknown option id/);
  });

  test('SecurityDeckSession tracks score, calculates stats, and exports scorecard', () => {
    const session = new SecurityDeckSession();
    assert.equal(session.getScore(), 0);
    assert.equal(session.getStats().answered, 0);

    // Answer 1 correct
    session.submitAnswer('telemetry-leakage', 'opt-b');
    assert.equal(session.getScore(), 10);
    assert.equal(session.getStats().percentage, 100);

    // Answer 1 wrong
    session.submitAnswer('crypto-vault-storage', 'opt-a');
    assert.equal(session.getScore(), 10);
    assert.equal(session.getStats().answered, 2);
    assert.equal(session.getStats().correct, 1);
    assert.equal(session.getStats().percentage, 50);

    // Answer 1 correct
    session.submitAnswer('podcasting-standards', 'opt-a');
    assert.equal(session.getScore(), 20);
    assert.equal(session.getStats().answered, 3);
    assert.equal(session.getStats().correct, 2);
    assert.equal(session.getStats().percentage, 67);

    // Scorecard export
    const markdown = session.exportMarkdownScorecard();
    assert.ok(markdown.includes('# Security & Architecture Challenge Scorecard'));
    assert.ok(markdown.includes('Clouds Against Humanity'));
    assert.ok(markdown.includes('Zero-Telemetry Isolation'));
    assert.ok(markdown.includes('Score:** 20 /'));
  });
});
