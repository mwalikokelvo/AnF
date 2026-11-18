# Phase 4 brief: Schedule (reminders and daily briefing across restarts)

Version 0.4.x. Built and merged on CI gates alone per `docs/KEVO-PLAN.md` (Phases 3, 4 and 5 are merged consecutively, and one PC test after Phase 5 covers all three). Each step is one pull request.

Why: Current timers and reminders in `jarvis-voice-agent.ts` rely on in-memory JavaScript `setTimeout` handles. If AnF is closed, restarted, or minimized, timers are lost or silenced. Users cannot schedule future reminders ("Remind me in 30 minutes to check the oven", "Remind me at 5 PM to call John"), there is no persistent schedule store, and daily briefings must be triggered manually instead of delivered on schedule.

Phase 4 is done when:
- Reminders explicitly scheduled with Kevo survive an application restart and fire on time.
- Each reminder fires exactly once with a native audio notification, even when the window is minimized.
- Scheduled reminders can be queried ("What reminders do I have?") and cancelled ("Cancel my reminder to check the oven").
- Daily briefing can be configured for a recurring morning schedule and delivers an executive summary.
- Size and count bounds are enforced, and corrupted schedule files heal gracefully.

## 4.1 Persistent schedule and reminder store

Add `windows/src-tauri/src/kevo_schedule.rs` providing structured, thread-safe, atomic disk storage in `settings::local_dir()/kevo/kevo-schedule.json`:
- `KevoReminder`: `{ id: string, message: string, trigger_at: number, created_at: number, fired: boolean, recurring?: "daily" | null }`
- Enforce size bounds (max 200 reminders; prune fired ones older than 7 days).
- Background scheduler loop in Rust running every 5 seconds:
  - Scans for reminders where `trigger_at <= now` and `!fired`.
  - Marks them `fired = true`, saves the store atomically, and emits `kevo://reminder-triggered`.
  - Plays an audible chime and displays a Windows system notification so alerts sound with the window minimized.

Tauri commands:
- `kevo_schedule_create_reminder(message: String, trigger_at: u64, recurring: Option<String>) -> Result<KevoReminder, String>`
- `kevo_schedule_list_reminders(include_fired: Option<bool>) -> Result<Vec<KevoReminder>, String>`
- `kevo_schedule_cancel_reminder(id: String) -> Result<bool, String>`
- `kevo_schedule_clear_reminders() -> Result<bool, String>`

Expose on `Bridge` (`windows/src/core/bridge.ts`) and create TypeScript wrapper `windows/src/workspace/jarvis/voice/jarvis-schedule.ts`.

## 4.2 Reminder action and tool calling

Add reminder actions to `windows/src/workspace/jarvis/voice/kevo-actions.ts`:
- `create_reminder`:
  - Description: "Schedule a reminder with a specific message and time delay or target time."
  - Parameters: `{ message: string, delay_seconds?: number, target_time?: string, recurring?: string }`
  - Result: Schedules via `Bridge.kevoScheduleCreateReminder`, confirms with concise spoken speech ("Reminder set for ...").
- `list_reminders`:
  - Description: "List upcoming active scheduled reminders."
  - Result: Queries pending reminders and announces next upcoming items.
- `cancel_reminder`:
  - Description: "Cancel a scheduled reminder by ID or matching keyword."
  - Parameters: `{ id?: string, query?: string }`
  - Result: Cancels matching reminder and speaks confirmation.

Fast path in `jarvis-voice-agent.ts`:
- "remind me in X minutes to Y", "remind me to Y in X minutes", "set a reminder for Y in X minutes".
- "what are my reminders", "what reminders do I have", "list reminders".
- "cancel reminder for Y", "cancel my reminder to Y".

## 4.3 Daily briefing scheduler

In `windows/src-tauri/src/kevo_schedule.rs` and `jarvis-schedule.ts`:
- Support recurring daily schedules (e.g. `recurring: "daily"` with target time-of-day such as 08:00).
- When a daily briefing fires, trigger `getBriefing()` and speak or notify executive summary (weather, date, top notes, remembered facts).
- Fast path and voice configuration: "Schedule daily briefing at 8 AM", "Turn off daily briefing".

## 4.4 Minimised window alert & audio notification

Implement background native alerting:
- When a reminder triggers, use Tauri notification API / Windows system tray alert to alert user even if Coucou/AnF is minimized, hidden in tray, or in the background.
- Trigger native system sound / chime so user is alerted without needing screen focus.

## 4.5 Schedule UI & test suite

In Kevo Command Desk (`windows/src/workspace/jarvis/jarvis-command-desk.ts`):
- Add a "Reminders & Schedule" card displaying pending reminders with live countdown timers, recurring badges, and cancel buttons.

Unit and integration tests:
- Rust tests in `kevo_schedule.rs` for creation, firing, single-fire guarantee, cancellation, restart survival, and corrupt file fallback.
- TypeScript tests in `jarvis-schedule.test.ts` and `kevo-actions.test.ts`.
- Phrase list tests in `windows/tests/kevo-phrases.json` for reminder scheduling, listing, and cancellation.
