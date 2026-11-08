import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulateSwarmConsensus,
  simulationToMarkdownNote,
  DEFAULT_SWARM_PERSONAS,
  type SwarmPersonaDefinition,
} from '../src/workspace/ai/swarm-simulation.js';

describe('Multi-Perspective Swarm Simulation (MiroFish Integration)', () => {
  test('simulateSwarmConsensus evaluates topic across 4 default personas and computes consensus', () => {
    const topic = 'Local-first offline note sync with PBKDF2 encryption and native Web APIs';
    const context = ['Uses zero cloud telemetry', 'Standard RFC 5545 task export', 'Minimal npm dependencies'];

    const result = simulateSwarmConsensus(topic, context);

    assert.equal(result.topic, topic);
    assert.equal(result.perspectives.length, 4);
    assert.ok(result.consensusScore >= 80, `Expected score >= 80, got ${result.consensusScore}`);
    assert.equal(result.dominantStance, 'favorable');

    const agentNames = result.perspectives.map(p => p.agentName);
    assert.ok(agentNames.includes('Security & Privacy Guardian'));
    assert.ok(agentNames.includes('Architect & Pragmatist'));
    assert.ok(agentNames.includes('User Experience Advocate'));
    assert.ok(agentNames.includes('Systems Futurist'));

    assert.ok(result.consensusPoints.length > 0);
    assert.ok(result.synthesis.includes('Swarm consensus'));
  });

  test('Security & Privacy Guardian detects unencrypted cloud telemetry and flags critical stance', () => {
    const topic = 'Stream all user keystrokes to remote unencrypted cloud analytics server';
    const context = ['Collects public telemetry and broadcast logs'];

    const result = simulateSwarmConsensus(topic, context);
    const security = result.perspectives.find(p => p.agentName === 'Security & Privacy Guardian');

    assert.ok(security);
    assert.equal(security.stance, 'critical');
    assert.ok(security.score < 50);
    assert.ok(result.frictionPoints.some(fp => fp.includes('Security & Privacy Guardian')));
  });

  test('Systems Futurist detects open standards (RFC, Podcasting 2.0, WAV) and awards high score', () => {
    const topic = 'Podcasting 2.0 namespace XML chapters and standard 16-bit PCM WAV audio exports';
    const result = simulateSwarmConsensus(topic);
    const futurist = result.perspectives.find(p => p.agentName === 'Systems Futurist');

    assert.ok(futurist);
    assert.equal(futurist.stance, 'favorable');
    assert.ok(futurist.score >= 90);
  });

  test('simulationToMarkdownNote formats complete Obsidian/AnF note with YAML frontmatter', () => {
    const topic = 'Offline-first Audio DSP and Waveform Editing';
    const result = simulateSwarmConsensus(topic);
    const note = simulationToMarkdownNote(result);

    assert.ok(note.startsWith('---'));
    assert.ok(note.includes('type: swarm-simulation'));
    assert.ok(note.includes('tags:\n  - swarm\n  - simulation\n  - mirofish'));
    assert.ok(note.includes('# Swarm Simulation: Offline-first Audio DSP and Waveform Editing'));
    assert.ok(note.includes('## Synthesis'));
    assert.ok(note.includes('## Agent Perspectives'));
    assert.ok(note.includes('## Points of Strong Consensus'));
    assert.ok(note.includes('## Points of Friction & Divergence'));
    assert.ok(note.includes('- [x]'));
  });

  test('supports custom persona evaluation', () => {
    const customPersona: SwarmPersonaDefinition = {
      name: 'Accessibility Specialist',
      role: 'WCAG 2.2 AA compliance and screen reader verification',
      focusKeywords: ['aria', 'contrast', 'screen-reader', 'keyboard'],
      riskKeywords: ['mouse-only', 'low-contrast'],
      evaluate: (topic: string) => ({
        stance: topic.includes('aria') ? 'favorable' : 'cautious',
        score: topic.includes('aria') ? 95 : 60,
        assessment: 'Evaluated for accessible DOM tree and focus rings.',
        keyPoints: ['Enforce aria-label on icon buttons'],
        blindspots: ['Check live-regions for dynamic audio status announcements'],
      }),
    };

    const result = simulateSwarmConsensus('Keyboard-driven music player with aria labels', [], [customPersona]);
    assert.equal(result.perspectives.length, 1);
    assert.equal(result.perspectives[0].agentName, 'Accessibility Specialist');
    assert.equal(result.perspectives[0].stance, 'favorable');
    assert.equal(result.perspectives[0].score, 95);
  });
});
