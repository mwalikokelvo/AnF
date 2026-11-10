import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Setup minimal localStorage mock for Node test environment
const mockStorage = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage?.getItem) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => mockStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockStorage.set(k, String(v)),
      removeItem: (k: string) => mockStorage.delete(k),
      clear: () => mockStorage.clear(),
      key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
      get length() { return mockStorage.size; }
    },
    configurable: true,
    writable: true
  });
}

import { CapScreenRecorder } from '../src/workspace/screen-recorder.js';
import { SupoclipEngine } from '../src/workspace/video-clipper.js';
import { AppFlowyManager } from '../src/workspace/appflowy-workspace.js';
import { CalDeskManager } from '../src/workspace/cal-desk.js';

describe('Cap Screen & Audio Recording Studio Native Integration', () => {
  test('CapScreenRecorder initializes with default idle state', () => {
    const recorder = new CapScreenRecorder();
    const state = recorder.getState();
    assert.equal(state.isRecording, false);
    assert.equal(state.isPaused, false);
    assert.equal(state.durationSec, 0);
    assert.equal(state.hasMedia, false);
  });

  test('CapScreenRecorder subscribe delivers initial state and updates', () => {
    const recorder = new CapScreenRecorder();
    let updates = 0;
    const unsub = recorder.subscribe(s => {
      updates++;
      assert.equal(typeof s.isRecording, 'boolean');
    });
    assert.equal(updates, 1);
    unsub();
  });
});

describe('Supoclip Native AI Video Clipper & Subtitle Engine', () => {
  test('SupoclipEngine configures aspect ratio and subtitle styles', () => {
    const engine = new SupoclipEngine('blob:test', '16:9');
    assert.equal(engine.getProject().aspectRatio, '16:9');

    engine.setAspectRatio('9:16');
    assert.equal(engine.getProject().aspectRatio, '9:16');

    engine.setSubtitleStyle('bold-pop');
    assert.equal(engine.getProject().subtitleStyle, 'bold-pop');
  });

  test('SupoclipEngine imports cues from plain text with timestamps', () => {
    const engine = new SupoclipEngine();
    const transcript = 'Welcome to AnF.\nHere is our built-in video editor.\nIt works completely offline.';
    const cues = engine.importCuesFromText(transcript, 30);

    assert.equal(cues.length, 3);
    assert.equal(cues[0].text, 'Welcome to AnF.');
    assert.equal(cues[0].startSec, 0);
    assert.ok(cues[0].endSec > cues[0].startSec);
    assert.ok(cues[1].startSec >= cues[0].endSec);
  });

  test('SupoclipEngine extracts highlights and exports valid project', () => {
    const engine = new SupoclipEngine('https://example.com/video.mp4');
    engine.importCuesFromText('Line one of the episode.\nHighlight moment here!\nConclusion of the podcast.', 60);
    
    const highlights = engine.generateHighlights(60, 20);
    assert.ok(Array.isArray(highlights));
    assert.ok(highlights.length > 0);
    assert.equal(highlights[0].startSec, 0);
    assert.equal(highlights[0].endSec, 20);

    const framing = engine.getFramingCss('9:16');
    assert.equal(framing.width, '270px');
    assert.equal(framing.height, '480px');

    const projectJson = engine.exportProjectJson();
    assert.ok(projectJson.includes('https://example.com/video.mp4'));
  });
});

describe('AppFlowy Workspace & Relational Grid Database Native Integration', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  test('AppFlowyManager loads initial default database', () => {
    const manager = new AppFlowyManager();
    const cards = manager.getCards();
    assert.ok(cards.length >= 2);
    assert.ok(cards.some(c => c.status === 'done'));
  });

  test('AppFlowyManager adds, moves, and deletes cards', () => {
    const manager = new AppFlowyManager();
    const newCard = manager.addCard({
      title: 'Build offline-first SQLite driver',
      description: 'Support encrypted local database store.',
      priority: 'high',
      status: 'todo',
      tags: ['database', 'rust']
    });

    assert.ok(newCard.id);
    assert.equal(newCard.title, 'Build offline-first SQLite driver');
    assert.equal(newCard.status, 'todo');

    // Move to in_progress
    const moved = manager.moveCard(newCard.id, 'in_progress');
    assert.equal(moved, true);
    const movedCard = manager.getCards('in_progress').find(c => c.id === newCard.id);
    assert.ok(movedCard);
    assert.equal(movedCard.status, 'in_progress');

    // Delete card
    const deleted = manager.deleteCard(newCard.id);
    assert.equal(deleted, true);
    assert.equal(manager.getCards().find(c => c.id === newCard.id), undefined);
  });

  test('AppFlowyManager exports clean markdown table representation', () => {
    const manager = new AppFlowyManager();
    const md = manager.exportMarkdownTable();
    assert.ok(md.includes('| Title | Status | Priority | Due Date | Tags |'));
    assert.ok(md.includes('| --- | --- | --- | --- | --- |'));
    assert.ok(md.includes('Cap screen recording'));
  });
});

describe('Cal.com (Cal.diy) Scheduling Desk Native Integration', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  test('CalDeskManager provides available 30-minute time slots', () => {
    const cal = new CalDeskManager();
    const testDate = '2026-11-20';
    const slots = cal.getSlotsForDate(testDate);
    assert.ok(slots.length > 5);
    assert.ok(slots.some(s => s.time === '09:00'));
    assert.ok(slots.every(s => s.available === true));
  });

  test('CalDeskManager books appointment and marks slot unavailable', () => {
    const cal = new CalDeskManager();
    const testDate = '2026-11-20';
    const res = cal.bookAppointment({
      title: 'Quarterly Security Audit',
      attendeeName: 'Alex Mercer',
      attendeeEmail: 'alex@example.com',
      dateStr: testDate,
      timeStr: '11:00',
      durationMinutes: 30,
      notes: 'Review local permission boundaries.'
    });

    assert.equal(res.success, true);
    assert.ok(res.appointment);
    assert.ok(res.appointment.id);

    const slots = cal.getSlotsForDate(testDate);
    const bookedSlot = slots.find(s => s.time === '11:00');
    assert.ok(bookedSlot);
    assert.equal(bookedSlot.available, false);

    // Attempting to book the same slot returns conflict error
    const conflict = cal.bookAppointment({
      title: 'Conflicting meeting',
      attendeeName: 'Bob',
      attendeeEmail: 'bob@example.com',
      dateStr: testDate,
      timeStr: '11:00',
      durationMinutes: 30
    });
    assert.equal(conflict.success, false);
    assert.ok(conflict.error?.includes('already booked'));
  });

  test('CalDeskManager generates valid .ics iCalendar file content', () => {
    const cal = new CalDeskManager();
    const appointments = cal.getAppointments();
    assert.ok(appointments.length > 0);
    const ics = cal.exportIcs(appointments[0]);
    assert.ok(ics.includes('BEGIN:VCALENDAR'));
    assert.ok(ics.includes('VERSION:2.0'));
    assert.ok(ics.includes('BEGIN:VEVENT'));
    assert.ok(ics.includes('SUMMARY:' + appointments[0].title));
    assert.ok(ics.includes('END:VEVENT'));
    assert.ok(ics.includes('END:VCALENDAR'));
  });
});
