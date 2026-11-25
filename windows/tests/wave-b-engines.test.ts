import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SocraticQuizEngine } from '../src/workspace/reader/socratic-quiz.js';
import { FallacyAuditor } from '../src/workspace/research/fallacy-auditor.js';
import { PrismaMatrixEngine } from '../src/workspace/research/prisma-matrix.js';
import { ElevationChronoLens } from '../src/workspace/reader/elevation-lens.js';
import { AcousticFingerprinter } from '../src/workspace/audio/acoustic-fingerprint.js';

describe('Wave B: Deep Analytical, Spatial & Acoustic Engines', () => {
  test('SocraticQuizEngine generates questions, measures confusion index and adapts difficulty', () => {
    const engine = new SocraticQuizEngine();
    const passage = `The printing press led to a massive democratization of knowledge across Europe because movable type drastically reduced manuscript production costs. Therefore, literacy rates among merchants and artisans surged rapidly.`;

    const questions = engine.generateQuestions(passage);
    assert.ok(questions.length >= 1);

    const q = questions[0];
    assert.ok(q.expectedKeywords.length > 0);

    // Excellent answer
    const evalGood = engine.evaluateAnswer(q, 'The printing press and movable type drastically reduced manuscript production costs and caused a massive surge in knowledge.');
    assert.ok(evalGood.score >= 0.7);
    assert.ok(evalGood.confusionIndex <= 0.3);

    // Confused answer
    const evalPoor = engine.evaluateAnswer(q, 'I have no idea what this is about, maybe cats.');
    assert.ok(evalPoor.confusionIndex >= 0.7);
    assert.ok(evalPoor.feedback.includes('High confusion detected'));
  });

  test('FallacyAuditor detects ad hominem, false dilemma and calculates argumentative rigor', () => {
    const auditor = new FallacyAuditor();
    const debateText = `
      We must either ban all digital devices or face total ruin of human civilization.
      Furthermore, anyone who opposes this measure is foolish and corrupt motives are obvious.
      Since internet usage increased after 2000, it clearly caused the decline in public discourse.
    `;

    const report = auditor.auditText(debateText);
    assert.ok(report.findings.length >= 3);
    assert.ok(report.findings.some(f => f.type === 'false_dilemma'));
    assert.ok(report.findings.some(f => f.type === 'ad_hominem'));
    assert.ok(report.findings.some(f => f.type === 'correlation_causation'));
    assert.ok(report.rigorScore < 60);
  });

  test('PrismaMatrixEngine generates PRISMA 2020 flow diagram and synthesis matrix', () => {
    const engine = new PrismaMatrixEngine({
      identified: 120,
      duplicatesRemoved: 20,
      screened: 100,
      screenedExcluded: 60,
      eligibilityAssessed: 40
    });

    engine.addEligibilityExclusion('Wrong population', 15);
    engine.addEligibilityExclusion('No quantitative data', 10);

    engine.addStudy({
      id: 'study_1',
      citation: 'Smith et al. (2024)',
      researchQuestion: 'Impact of local-first offline reading on retention',
      methodology: 'Randomized controlled trial (n=200)',
      findings: '28% increase in long-term factual recall without distractions',
      limitations: 'Sample limited to university undergraduates'
    });

    const mermaid = engine.generatePrismaMermaidDiagram();
    assert.ok(mermaid.includes('flowchart TD'));
    assert.ok(mermaid.includes('Records Identified (n = 120)'));
    assert.ok(mermaid.includes('Wrong population: 15'));

    const matrix = engine.generateSynthesisMatrixMarkdown();
    assert.ok(matrix.includes('Smith et al. (2024)'));
    assert.ok(matrix.includes('Randomized controlled trial'));
  });

  test('ElevationChronoLens classifies historical eras and generates topographic elevation profile', () => {
    const lens = new ElevationChronoLens();

    assert.equal(ElevationChronoLens.classifyEra(350), 'antiquity');
    assert.equal(ElevationChronoLens.classifyEra(1200), 'medieval');
    assert.equal(ElevationChronoLens.classifyEra(1750), 'early_modern');
    assert.equal(ElevationChronoLens.classifyEra(1920), 'modern');
    assert.equal(ElevationChronoLens.classifyEra(2024), 'contemporary');

    // Route across the Alps: Milan (45.4642, 9.1900) to Zurich (47.3769, 8.5417)
    const waypoints = [
      { lat: 45.4642, lng: 9.1900 },
      { lat: 47.3769, lng: 8.5417 }
    ];

    const elevation = lens.generateRouteElevationProfile(waypoints, 10);
    assert.ok(elevation.profile.length > 5);
    assert.ok(elevation.maxElevationMeters > 2000, 'Alps route should reach alpine altitudes');
    assert.ok(elevation.totalElevationGainMeters > 1000);
  });

  test('AcousticFingerprinter extracts pitch F0, formants and matches voice profiles', () => {
    const fingerprinter = new AcousticFingerprinter();
    const sampleRate = 16000;
    const durationSec = 0.5;
    const n = Math.floor(sampleRate * durationSec);
    const samples = new Float32Array(n);

    // Synthesize a 120 Hz test tone with harmonics (simulating deep male voice)
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      samples[i] = 0.6 * Math.sin(2 * Math.PI * 120 * t) +
                   0.3 * Math.sin(2 * Math.PI * 400 * t) +
                   0.1 * Math.sin(2 * Math.PI * 1200 * t);
    }

    const fingerprint = fingerprinter.fingerprintAudio(samples, sampleRate);
    assert.ok(fingerprint.pitchMedianHz >= 110 && fingerprint.pitchMedianHz <= 135);
    assert.ok(fingerprint.formantF1Hz >= 300);

    const match = fingerprinter.matchClosestVoiceProfile(fingerprint);
    assert.equal(match.profile.id, 'voice_deep_baritone');
  });
});
