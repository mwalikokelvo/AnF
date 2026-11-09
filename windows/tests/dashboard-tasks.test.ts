import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftTasks,
  dayName,
  captureText,
  tasksToIcs,
} from '../../shared/domain/dashboard-data.js';

describe('Dashboard Tasks & iCalendar Export', () => {
  test('draftTasks parses task status across todo, in-progress, and done markers', () => {
    const markdown = `# Sprint Tasks
- [ ] Todo backlog item
- [/] Currently active task
- [~] Alternative in-progress mark
- [x] Finished item
- [X] Uppercase finished item
`;
    const tasks = draftTasks(markdown);
    assert.equal(tasks.length, 5);
    assert.equal(tasks[0].status, 'todo');
    assert.equal(tasks[0].checked, false);
    assert.equal(tasks[1].status, 'in-progress');
    assert.equal(tasks[1].checked, false);
    assert.equal(tasks[2].status, 'in-progress');
    assert.equal(tasks[2].checked, false);
    assert.equal(tasks[3].status, 'done');
    assert.equal(tasks[3].checked, true);
    assert.equal(tasks[4].status, 'done');
    assert.equal(tasks[4].checked, true);
  });


  test('draftTasks parses checkbox tasks and ignores code block fences', () => {
    const markdown = `# Project Plan
- [ ] First task
- [x] Completed task

\`\`\`markdown
- [ ] Example inside code fence
\`\`\`

- [ ] Second task outside
`;
    const tasks = draftTasks(markdown);
    assert.equal(tasks.length, 3);
    assert.equal(tasks[0].text, 'First task');
    assert.equal(tasks[0].checked, false);
    assert.equal(tasks[1].text, 'Completed task');
    assert.equal(tasks[1].checked, true);
    assert.equal(tasks[2].text, 'Second task outside');
    assert.equal(tasks[2].checked, false);
  });

  test('tasksToIcs exports standard RFC 5545 VTODO iCalendar format', () => {
    const tasks = [
      { text: 'Audit website SEO metadata', source: 'Marketing Notes' },
      { text: 'Review Spotify-class crossfade curve', source: 'Audio Engine' },
    ];

    const ics = tasksToIcs(tasks);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
    assert.ok(ics.includes('VERSION:2.0'));
    assert.ok(ics.includes('PRODID:-//AnF Workspace//Task Calendar//EN'));
    assert.ok(ics.includes('BEGIN:VTODO'));
    assert.ok(ics.includes('SUMMARY:Audit website SEO metadata'));
    assert.ok(ics.includes('DESCRIPTION:Source: Marketing Notes'));
    assert.ok(ics.includes('SUMMARY:Review Spotify-class crossfade curve'));
    assert.ok(ics.includes('DESCRIPTION:Source: Audio Engine'));
    assert.ok(ics.includes('STATUS:NEEDS-ACTION'));
    assert.ok(ics.endsWith('END:VCALENDAR'));
  });

  test('tasksToIcs handles empty task lists cleanly', () => {
    const ics = tasksToIcs([]);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
    assert.ok(ics.endsWith('END:VCALENDAR'));
    assert.ok(!ics.includes('BEGIN:VTODO'));
  });

  test('dayName formats date consistently', () => {
    const date = new Date(2026, 10, 8); // Nov 8, 2026
    const name = dayName(date);
    assert.equal(name, 'Daily · 2026-11-08');
  });

  test('captureText appends timestamped section and enforces limit', () => {
    const draft = 'Initial log text.';
    const captured = captureText(draft, 'New reflection note.', new Date(2026, 10, 8, 14, 30));
    assert.ok(captured.startsWith('Initial log text.'));
    assert.ok(captured.includes('## 14:30') || captured.includes('## 02:30') || captured.includes('## 2:30'));
    assert.ok(captured.includes('New reflection note.'));

    assert.throws(() => captureText(draft, '   '), /Write a thought first/);
  });
});
