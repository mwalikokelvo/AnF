import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateStoryboardFromText,
  formatHiggsfieldPrompt,
  storyboardToMarkdown,
  markdownToStoryboard,
  SceneShot,
} from '../src/workspace/storyboard.js';

test('Open-Higgsfield-AI Storyboard Engine', async (t) => {
  await t.test('formatHiggsfieldPrompt generates camera trajectory prompt', () => {
    const shot: SceneShot = {
      id: 'shot-1',
      sceneNumber: 1,
      shotNumber: 1,
      title: 'City Skyline',
      shotType: 'wide',
      cameraMotion: 'dolly-in',
      motionSpeed: 1.2,
      durationSeconds: 6,
      visualPrompt: 'Cyberpunk futuristic metropolis with flying vehicles',
      lightingPrompt: 'neon cyberpunk lighting, contrasting teal and magenta hues',
      audioPrompt: 'ambient atmospheric soundtrack with sirens',
    };

    const prompt = formatHiggsfieldPrompt(shot);
    assert.match(prompt, /\[camera: dolly-in, speed: 1\.2\]/);
    assert.match(prompt, /\[framing: wide\]/);
    assert.match(prompt, /Cyberpunk futuristic metropolis/);
    assert.match(prompt, /lighting: neon cyberpunk lighting/);
    assert.match(prompt, /sfx: ambient atmospheric soundtrack/);
  });

  await t.test('formatHiggsfieldPrompt handles static camera motion', () => {
    const shot: SceneShot = {
      id: 'shot-2',
      sceneNumber: 1,
      shotNumber: 2,
      title: 'Face Detail',
      shotType: 'close-up',
      cameraMotion: 'static',
      motionSpeed: 1.0,
      durationSeconds: 4,
      visualPrompt: 'Character eyes blinking slowly in disbelief',
      lightingPrompt: '',
      audioPrompt: '',
    };

    const prompt = formatHiggsfieldPrompt(shot);
    assert.match(prompt, /\[camera: static\]/);
    assert.match(prompt, /\[framing: close-up\]/);
    assert.match(prompt, /Character eyes blinking slowly/);
  });

  await t.test('generateStoryboardFromText parses scenes and infers cinematic cues', () => {
    const screenplay = `
## Scene 1: Arrival
A wide view of the ancient mountain valley under the golden hour sunlight.

## Scene 2: The Discovery
Close-up on the explorer's eyes as they discover the hidden glowing crystal.
The shadows deepen as night falls.
    `.trim();

    const sb = generateStoryboardFromText(screenplay, 'Mountain Expedition');
    assert.equal(sb.title, 'Mountain Expedition');
    assert.equal(sb.shots.length, 2);
    assert.ok(sb.totalDurationSeconds >= 10);

    // Shot 1 should detect wide framing and golden hour lighting
    const s1 = sb.shots[0];
    assert.equal(s1.shotType, 'wide');
    assert.match(s1.lightingPrompt, /golden hour/i);

    // Shot 2 should detect close-up framing and dark/moody lighting
    const s2 = sb.shots[1];
    assert.equal(s2.shotType, 'close-up');
    assert.match(s2.lightingPrompt, /moody shadows/i);
  });

  await t.test('storyboardToMarkdown and markdownToStoryboard round-trip correctly', () => {
    const text = `
EXT. CYBERPUNK ALLEY - NIGHT
The detective walks slowly through the heavy rain. Neon reflections shimmer in puddles.

INT. HIDDEN LAB
Close-up on the microchip humming softly with blue LED pulses.
    `.trim();

    const sb = generateStoryboardFromText(text, 'Blade Protocol');
    const md = storyboardToMarkdown(sb);

    assert.match(md, /generator: open-higgsfield-ai/);
    assert.match(md, /### Shot 1:/);
    assert.match(md, /```higgsfield/);

    const parsed = markdownToStoryboard(md);
    assert.ok(parsed);
    assert.equal(parsed.shots.length, sb.shots.length);
    assert.equal(parsed.shots[0].shotNumber, 1);
    assert.equal(parsed.shots[1].shotNumber, 2);
  });

  await t.test('generateStoryboardFromText handles empty input gracefully', () => {
    const sb = generateStoryboardFromText('', 'Empty Test');
    assert.equal(sb.shots.length, 0);
    assert.equal(sb.totalDurationSeconds, 0);
  });
});
