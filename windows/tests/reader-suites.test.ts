import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClassroomModeCore } from '../src/workspace/reader/classroom-mode';
import { SpatialAtlasCore } from '../src/workspace/reader/spatial-atlas';
import { DialogueNarratorCore } from '../src/workspace/reader/dialogue-narrator';

describe('AnF Ported Reader Suites (Classroom, Spatial Atlas, Dialogue Narration)', () => {
  it('creates classroom session and formats notes', () => {
    const session = ClassroomModeCore.createClassroomSession('Quantum Optics', 'Photons exhibit particle-wave duality.');
    assert.equal(session.agents.length, 3);
    assert.ok(session.generateQuizPrompt.includes('3 multiple-choice'));

    const md = ClassroomModeCore.formatSeminarNotes(session, [
      { role: 'Instructor', response: 'Wavefunction collapse explains observations.' },
      { role: 'Student Skeptic', response: 'What about pilot wave theories?' }
    ]);
    assert.ok(md.includes('### Instructor'));
    assert.ok(md.includes('### Student Skeptic'));
  });

  it('extracts narrative waypoints and generates GeoJSON', () => {
    const text = 'Leaving Paris by evening train, they arrived in Rome before daybreak.';
    const waypoints = SpatialAtlasCore.extractNarrativeWaypoints('Chapter 2', text);
    assert.equal(waypoints.length, 2);
    assert.equal(waypoints[0].location, 'Paris');
    assert.equal(waypoints[1].location, 'Rome');

    const geoJson = SpatialAtlasCore.toGeoJson(waypoints);
    assert.equal(geoJson.type, 'FeatureCollection');
    assert.equal(geoJson.features.length, 2);
  });

  it('segments prose and dialogue with pitch/rate multipliers', () => {
    const text = 'The master looked up. "Knowledge requires discipline," he warned. The student took a seat.';
    const segments = DialogueNarratorCore.segmentPassage(text);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].type, 'prose');
    assert.equal(segments[1].type, 'dialogue');
    assert.equal(segments[1].speaker, 'character');
    assert.equal(segments[1].text, 'Knowledge requires discipline,');
    assert.equal(segments[2].type, 'prose');

    const stats = DialogueNarratorCore.dialogueRatio(segments);
    assert.ok(stats.dialogueWords > 0);
    assert.ok(stats.proseWords > 0);
  });
});
