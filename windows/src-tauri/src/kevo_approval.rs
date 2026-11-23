//! Kevo's approval gate (`docs/kevo-briefs/hud.md`, H.4a). A risky action (sending a file to another device,
//! deleting anything, running a script) calls `ask` and goes ahead only if the owner approves on the HUD card.
//! Rust keeps the pending request: event `kevo://approve` `{id, action, summary}`, answer `kevo_hud_answer`.
//! No answer in 60 s means deny. One request at a time; a second waits until the first is answered.
//! No Kevo action uses it yet: Phase 5 (verified actions) and later actions must go through it.
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;

pub const APPROVE_EVENT: &str = "kevo://approve";
const ANSWER_WITHIN: Duration = Duration::from_secs(60);

#[derive(Debug, Serialize)]
pub struct ApprovalRequest<'a> {
    pub id: u64,
    pub action: &'a str,
    pub summary: &'a str,
}

#[derive(Default)]
pub struct Approvals {
    /// Held while a request is on screen, so a second one waits. Holds the last id given out.
    turn: tokio::sync::Mutex<u64>,
    waiting: Mutex<Option<(u64, oneshot::Sender<bool>)>>,
}

impl Approvals {
    /// Shows one request (through `show`) and waits for its answer. Unanswered after 60 s: denied.
    pub async fn ask(
        &self,
        action: &str,
        summary: &str,
        show: impl FnOnce(&ApprovalRequest),
    ) -> bool {
        let mut last = self.turn.lock().await;
        *last += 1;
        let id = *last;
        let (answer, answered) = oneshot::channel();
        *self.waiting.lock().unwrap_or_else(|e| e.into_inner()) = Some((id, answer));
        show(&ApprovalRequest {
            id,
            action,
            summary,
        });
        // The 60 s start when the card is shown, not while the request waits its turn.
        let approved = matches!(
            tokio::time::timeout(ANSWER_WITHIN, answered).await,
            Ok(Ok(true))
        );
        self.waiting
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take_if(|(waiting, _)| *waiting == id);
        approved
    }

    /// The owner's answer to the request on screen. Any other id (unknown, already answered, timed out) is refused.
    pub fn answer(&self, id: u64, approved: bool) -> Result<(), String> {
        let mut waiting = self.waiting.lock().unwrap_or_else(|e| e.into_inner());
        let (_, answer) = waiting
            .take_if(|(waiting, _)| *waiting == id)
            .ok_or("No request is waiting for that answer.")?;
        let _ = answer.send(approved);
        Ok(())
    }
}

/// Asks the owner on the HUD card whether `action` may go ahead; `summary` says what it will do, in plain words.
pub async fn ask(app: &AppHandle, action: &str, summary: &str) -> bool {
    app.state::<Approvals>()
        .ask(action, summary, |request| {
            let _ = app.emit(APPROVE_EVENT, request);
        })
        .await
}

/// Approve or Deny from the card (or a spoken "yes" / "cancel" while it is open).
#[tauri::command]
pub fn kevo_hud_answer(approvals: State<Approvals>, id: u64, approved: bool) -> Result<(), String> {
    approvals.answer(id, approved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Instant};

    fn record(shown: &Mutex<Vec<u64>>) -> impl FnOnce(&ApprovalRequest) + '_ {
        move |r| shown.lock().unwrap().push(r.id)
    }

    #[tokio::test(start_paused = true)]
    async fn no_answer_in_60_s_is_deny() {
        let gate = Approvals::default();
        let shown = Mutex::new(Vec::new());
        let start = Instant::now();
        let ask = gate.ask("delete", "Delete the note “Groceries”", record(&shown));
        tokio::pin!(ask);
        assert!(
            tokio::time::timeout(Duration::from_millis(59_900), &mut ask)
                .await
                .is_err(),
            "still waiting at 59.9 s"
        );
        assert!(!ask.await, "denied");
        assert_eq!(start.elapsed(), Duration::from_secs(60));
        assert!(
            gate.answer(1, true).is_err(),
            "an answer after the timeout is refused"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn one_request_at_a_time() {
        let gate = Approvals::default();
        let shown = Mutex::new(Vec::new());
        let first = gate.ask("send", "Send “Notes.md” to the phone", record(&shown));
        let second = gate.ask("run", "Run the backup script", record(&shown));
        let owner = async {
            sleep(Duration::from_secs(59)).await;
            assert_eq!(*shown.lock().unwrap(), [1], "the second request waits");
            assert!(
                gate.answer(2, true).is_err(),
                "the waiting request cannot be answered yet"
            );
            gate.answer(1, true).unwrap();
            // The second card's 60 s start when it is shown, not while it waited.
            sleep(Duration::from_secs(59)).await;
            assert_eq!(*shown.lock().unwrap(), [1, 2]);
            gate.answer(2, false).unwrap();
        };
        let (first, second, ()) = tokio::join!(first, second, owner);
        assert!(first, "approved");
        assert!(!second, "denied");
    }

    #[tokio::test(start_paused = true)]
    async fn unknown_id_is_refused() {
        let gate = Approvals::default();
        assert!(gate.answer(1, true).is_err(), "nothing is waiting");
        let shown = Mutex::new(Vec::new());
        let ask = gate.ask("delete", "Delete the note “Groceries”", record(&shown));
        let owner = async {
            sleep(Duration::from_secs(1)).await;
            assert!(gate.answer(7, true).is_err(), "unknown id");
            gate.answer(1, true).unwrap();
            assert!(gate.answer(1, false).is_err(), "answered once only");
        };
        let (approved, ()) = tokio::join!(ask, owner);
        assert!(approved, "the unknown id did not answer the request");
    }
}
