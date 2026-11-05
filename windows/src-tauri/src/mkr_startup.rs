//! The worker owns startup admission until its result is published or discarded.
use std::sync::{atomic::{AtomicBool, Ordering}, Arc};

pub struct Reservation(Arc<AtomicBool>);
impl Reservation {
    pub fn acquire(flag: Arc<AtomicBool>) -> Option<Self> {
        flag.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok().map(|_| Self(flag))
    }
}
impl Drop for Reservation {
    fn drop(&mut self) { self.0.store(false, Ordering::Release); }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{future::{pending, Future}, sync::mpsc, task::{Context, Waker}, thread};
    #[test]
    fn cancelled_receiver_keeps_worker_admission_until_actual_cleanup() {
        let flag = Arc::new(AtomicBool::new(false));
        let reservation = Reservation::acquire(flag.clone()).unwrap();
        let (go, wait) = mpsc::channel();
        let (reply, receive) = mpsc::channel();
        let worker = thread::spawn(move || {
            wait.recv().unwrap();
            // A cancelled join receiver discards the owned result, including admission.
            drop(reply.send(reservation));
        });
        drop(receive);
        assert!(Reservation::acquire(flag.clone()).is_none());
        go.send(()).unwrap();worker.join().unwrap();
        assert!(Reservation::acquire(flag).is_some());
    }
    #[test]
    fn completed_worker_keeps_admission_through_publication() {
        let flag = Arc::new(AtomicBool::new(false));
        let reservation = Reservation::acquire(flag.clone()).unwrap();
        let (host, publication) = ("prepared host", reservation);
        assert!(Reservation::acquire(flag.clone()).is_none());
        let published = Some(host);
        drop(publication);
        assert_eq!(published, Some("prepared host"));
        assert!(Reservation::acquire(flag).is_some());
    }
    #[test]
    fn cancelled_publication_wait_releases_admission() {
        let flag = Arc::new(AtomicBool::new(false));
        let reservation = Reservation::acquire(flag.clone()).unwrap();
        let mut request = Box::pin(async move {
            let _publication = reservation;
            pending::<()>().await;
        });
        let mut context = Context::from_waker(Waker::noop());
        assert!(request.as_mut().poll(&mut context).is_pending());
        drop(request);
        assert!(!flag.load(Ordering::Acquire));
        assert!(Reservation::acquire(flag).is_some());
    }
}
