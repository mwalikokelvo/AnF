import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AudioDuckerMixer } from '../src/workspace/audio/audio-ducker.js';
import { GoalDriftDetector } from '../src/workspace/ai/goal-drift-detector.js';
import { SolarTerminatorEngine } from '../src/workspace/reader/solar-terminator.js';
import { NanoTransformerKernels } from '../src/workspace/ai/rope-kernels.js';
import { SponsorBlockEngine } from '../src/workspace/media/sponsorblock.js';
import { PromptCacheOptimizer } from '../src/workspace/ai/prompt-cache-optimizer.js';
import { BlackboardDirector } from '../src/workspace/reader/blackboard-director.js';
import { AcademicHedgingCalibrator } from '../src/workspace/research/hedging-calibrator.js';
import { CitationSnowballGraph } from '../src/workspace/research/citation-snowball.js';

describe('Final Frontiers (2 to 10)', () => {
  test('Frontier 2: AudioDuckerMixer side-chain ducks background ambient stem', () => {
    const mixer = new AudioDuckerMixer({ sampleRate: 1000, duckingThresholdRms: 0.1, duckingGain: 0.25 });
    const n = 1000; // 1 second

    // Trigger stem: speech active in the middle (samples 300 to 700)
    const speechSamples = new Float32Array(n);
    for (let i = 300; i < 700; i++) speechSamples[i] = 0.5;

    // Ambient music: constant tone
    const musicSamples = new Float32Array(n);
    for (let i = 0; i < n; i++) musicSamples[i] = 0.5;

    mixer.addStem({ id: 'speech', name: 'Speech', samples: speechSamples, volume: 1.0, pan: 0, isSideChainTrigger: true });
    mixer.addStem({ id: 'music', name: 'Music', samples: musicSamples, volume: 1.0, pan: 0 });

    const master = mixer.mixdown();
    assert.equal(master.length, n);

    // During speech (e.g. index 500), ducking envelope attenuates music
    const env = mixer.computeDuckingEnvelope(speechSamples);
    assert.ok(env[500] < 0.5, 'Ducking envelope should be attenuated during speech');
    assert.ok(env[50] > 0.8, 'Ducking envelope should be high during silence');
  });

  test('Frontier 3: GoalDriftDetector flags alignment and detects task derailment', () => {
    const detector = new GoalDriftDetector('Build a private local offline book reader and audio player');

    // Closely aligned step
    const step1 = detector.evaluateStep('Build private offline book reader and audio playback core');
    assert.ok(step1.driftIndex < 0.65, `Expected low drift, got ${step1.driftIndex}`);
    assert.equal(step1.isDrifting, false);

    // Completely unrelated / derailed step
    const step2 = detector.evaluateStep('Cryptocurrency high frequency trading bot with Binance API leverage');
    assert.ok(step2.driftIndex > 0.65, `Expected high drift, got ${step2.driftIndex}`);
    assert.equal(step2.isDrifting, true);

    const report = detector.getReport();
    assert.equal(report.isDriftAlertTriggered, true);
    assert.ok(report.recommendation === 'recalibrate' || report.recommendation === 'halt');
  });

  test('Frontier 4: SolarTerminatorEngine computes celestial subsolar point and daylight state', () => {
    const date = new Date(Date.UTC(2024, 5, 21, 12, 0, 0)); // Summer solstice, 12:00 UTC
    const subsolar = SolarTerminatorEngine.computeSubsolarPoint(date);

    // Around summer solstice, subsolar latitude is ~ +23.44 deg, longitude near 0 deg
    assert.ok(subsolar.lat > 20 && subsolar.lat < 24);
    assert.ok(Math.abs(subsolar.lng) < 5);

    // London at noon on summer solstice should be broad daylight
    const illumLondon = SolarTerminatorEngine.getIllumination(51.5, 0.0, date);
    assert.equal(illumLondon.state, 'day');
    assert.ok(illumLondon.solarElevationDeg > 55);

    const terminator = SolarTerminatorEngine.generateTerminatorPoints(date, 12);
    assert.equal(terminator.length, 13);
  });

  test('Frontier 5: NanoTransformerKernels runs RMSNorm, RoPE and Scaled Dot-Product Attention', () => {
    const x = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    const gamma = new Float32Array([1.0, 1.0, 1.0, 1.0]);

    const normed = NanoTransformerKernels.rmsNorm(x, gamma);
    assert.equal(normed.length, 4);

    const rotated = NanoTransformerKernels.applyRoPE(x, 1);
    assert.equal(rotated.length, 4);
    assert.notEqual(rotated[0], x[0]);

    const q = new Float32Array([1.0, 0.0]);
    const keys = [new Float32Array([1.0, 0.0]), new Float32Array([0.0, 1.0])];
    const values = [new Float32Array([10.0, 0.0]), new Float32Array([0.0, 20.0])];

    const out = NanoTransformerKernels.scaledDotProductAttention(q, keys, values);
    assert.equal(out.length, 2);
    // Query aligned with key 0, so out[0] should receive higher value
    assert.ok(out[0] > out[1]);
  });

  test('Frontier 6: SponsorBlockEngine detects non-content intervals and jumps timestamps', () => {
    const engine = new SponsorBlockEngine([
      { category: 'intro', startSec: 0, endSec: 15, actionType: 'skip' },
      { category: 'sponsor', startSec: 120, endSec: 180, actionType: 'skip' }
    ]);

    const check1 = engine.checkTimestamp(5);
    assert.equal(check1.shouldSkip, true);
    assert.equal(check1.jumpToSec, 15);

    const check2 = engine.checkTimestamp(50);
    assert.equal(check2.shouldSkip, false);

    assert.equal(engine.getTotalTimeSavedSec(), 75);
  });

  test('Frontier 7: PromptCacheOptimizer inserts ephemeral cache breakpoints on static prefixes', () => {
    const optimizer = new PromptCacheOptimizer({ minCacheableTokens: 200, maxBreakpoints: 2 });
    const payload = optimizer.optimizePrompt([
      { type: 'system', content: 'A'.repeat(1200) }, // 300 tokens > 200 min
      { type: 'document', content: 'B'.repeat(1600) }, // 400 tokens > 200 min
      { type: 'message', content: 'Hello' }
    ]);

    assert.equal(payload.blocks[0].cacheControl?.type, 'ephemeral');
    assert.equal(payload.blocks[1].cacheControl?.type, 'ephemeral');
    assert.equal(payload.blocks[2].cacheControl, undefined);
    assert.ok(payload.cachedTokens >= 700);
    assert.ok(payload.estimatedSavingsUsd > 0);
  });

  test('Frontier 8: BlackboardDirector parses turns and renders chalkboard SVG', () => {
    const director = new BlackboardDirector();
    const turns = [
      { speaker: 'Professor', text: "Today our topic is Classical Thermodynamics and heat engines.", startSec: 0 },
      { speaker: 'Student', text: "Does entropy always increase in spontaneous processes?", startSec: 10 }
    ];

    const elems = director.generateFromDialogueTurns(turns);
    assert.ok(elems.length >= 2);

    const svg = director.renderSvgAtTime(15);
    assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(svg.includes('class="chalk-box"'));
  });

  test('Frontier 9: AcademicHedgingCalibrator audits epistemic humility and jargon', () => {
    const calibrator = new AcademicHedgingCalibrator();
    const paper = `
      The preliminary evidence suggests that local offline architectures preserve cognitive focus.
      Our benchmark evaluated 500 participants across 10 controlled reading trials.
      This appears to be consistent with cognitive load theory.
      However, other studies operationalization of variables was overly restrictive.
    `;

    const report = calibrator.auditTone(paper);
    assert.equal(report.toneClassification, 'balanced_scholarly');
    assert.ok(report.hedgingCount >= 2);
    assert.ok(report.findings.some(f => f.type === 'jargon_nominalization'));
  });

  test('Frontier 10: CitationSnowballGraph tracks backward/forward citations and finds seminal works', () => {
    const graph = new CitationSnowballGraph({
      id: 'vaswani2017',
      title: 'Attention Is All You Need',
      authors: 'Vaswani et al.',
      year: 2017
    });

    graph.addBackwardCitation('vaswani2017', {
      id: 'bahdanau2014',
      title: 'Neural Machine Translation by Jointly Learning to Align and Translate',
      authors: 'Bahdanau et al.',
      year: 2014
    });

    graph.addForwardCitation('vaswani2017', {
      id: 'devlin2018',
      title: 'BERT: Pre-training of Deep Bidirectional Transformers',
      authors: 'Devlin et al.',
      year: 2018
    });

    const seminal = graph.getSeminalFoundations();
    assert.ok(seminal.length >= 2);
    assert.ok(seminal.some(s => s.node.id === 'vaswani2017'));
    assert.ok(seminal.some(s => s.node.id === 'bahdanau2014'));

    const mermaid = graph.generateMermaidGraph();
    assert.ok(mermaid.includes('graph TD'));
    assert.ok(mermaid.includes('vaswani2017'));
    assert.ok(mermaid.includes('bahdanau2014'));
  });
});
