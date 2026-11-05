//! Cancellation-safe ownership of a single audio pause acknowledgement.
use std::sync::{Arc, Mutex};

pub type PendingSlot<T> = Arc<Mutex<Option<(String, T)>>>;

pub struct Reservation<T> {
    slot: PendingSlot<T>,
    token: String,
}
impl<T> Reservation<T> {
    pub fn reserve(slot: PendingSlot<T>, token: String, reply: T) -> Result<Self, &'static str> {
        {
            let mut pending = slot.lock().map_err(|_| "MKR handoff unavailable.")?;
            if pending.is_some() {
                return Err("MKR handoff is already in progress.");
            }
            *pending = Some((token.clone(), reply));
        }
        Ok(Self { slot, token })
    }
}
impl<T> Drop for Reservation<T> {
    fn drop(&mut self) {
        if let Ok(mut pending) = self.slot.lock() {
            if pending.as_ref().is_some_and(|(token, _)| token == &self.token) {
                pending.take();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{future::{pending, Future}, sync::mpsc, task::{Context, Waker}};
    #[test]
    fn dropped_wait_releases_slot_and_cancels_reply() {
        let slot = PendingSlot::default();
        let owned = slot.clone();
        let (send, receive) = mpsc::channel::<bool>();
        let mut request = Box::pin(async move {
            let _reservation = Reservation::reserve(owned, "first".into(), send).unwrap();
            pending::<()>().await;
        });
        let mut context = Context::from_waker(Waker::noop());
        assert!(request.as_mut().poll(&mut context).is_pending());
        assert!(slot.lock().unwrap().is_some());
        drop(request);
        assert!(slot.lock().unwrap().is_none());
        assert_eq!(receive.try_recv(), Err(mpsc::TryRecvError::Disconnected));
        let (send, _) = mpsc::channel();
        assert!(Reservation::reserve(slot, "second".into(), send).is_ok());
    }
    #[test]
    fn retired_reservation_cannot_remove_new_handoff() {
        let slot = PendingSlot::default();
        let first = Reservation::reserve(slot.clone(), "first".into(), ()).unwrap();
        slot.lock().unwrap().take(); // matching acknowledgement consumes the first reply
        let second = Reservation::reserve(slot.clone(), "second".into(), ()).unwrap();
        drop(first);
        assert_eq!(slot.lock().unwrap().as_ref().unwrap().0, "second");
        drop(second);
        assert!(slot.lock().unwrap().is_none());
    }
    #[test]
    fn concurrent_reservation_preserves_existing_request() {
        let slot = PendingSlot::default();
        let first = Reservation::reserve(slot.clone(), "first".into(), ()).unwrap();
        assert!(Reservation::reserve(slot.clone(), "second".into(), ()).is_err());
        assert_eq!(slot.lock().unwrap().as_ref().unwrap().0, "first");
        drop(first);
        assert!(slot.lock().unwrap().is_none());
    }
}
