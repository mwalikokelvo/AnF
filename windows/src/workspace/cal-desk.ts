/**
 * Cal.com (Cal.diy) Native Appointment & Scheduling Desk
 * Self-hosted, offline-first appointment scheduling infrastructure for AnF.
 * Provides calendar date picking, time slot generation, conflict-free booking,
 * and iCalendar (.ics) export.
 */
import { h } from '../views/dom';

export interface AppointmentSlot {
  time: string; // "09:00", "09:30"
  available: boolean;
}

export interface BookedAppointment {
  id: string;
  title: string;
  attendeeName: string;
  attendeeEmail: string;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:MM
  durationMinutes: number;
  notes?: string;
  createdAt: number;
}

const STORAGE_KEY = 'anf-calcom-bookings';

export class CalDeskManager {
  private appointments: BookedAppointment[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.appointments = this.load();
  }

  private load(): BookedAppointment[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}

    // Default starter appointment
    return [
      {
        id: 'cal-' + Date.now(),
        title: 'AnF Architecture & Product Review',
        attendeeName: 'Engineering Lead',
        attendeeEmail: 'lead@coucou.internal',
        dateStr: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        timeStr: '10:00',
        durationMinutes: 30,
        notes: 'Review native Cap and Cal.com integration milestones.',
        createdAt: Date.now(),
      },
    ];
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.appointments));
    } catch {}
    for (const l of this.listeners) {
      try { l(); } catch {}
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  getAppointments(forDate?: string): BookedAppointment[] {
    return forDate
      ? this.appointments.filter(a => a.dateStr === forDate)
      : [...this.appointments];
  }

  getSlotsForDate(dateStr: string): AppointmentSlot[] {
    const bookedTimes = new Set(
      this.appointments.filter(a => a.dateStr === dateStr).map(a => a.timeStr)
    );
    const standardTimes = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    ];

    return standardTimes.map(time => ({
      time,
      available: !bookedTimes.has(time),
    }));
  }

  bookAppointment(appt: Omit<BookedAppointment, 'id' | 'createdAt'>): { success: boolean; error?: string; appointment?: BookedAppointment } {
    // Check conflict
    const conflict = this.appointments.find(
      a => a.dateStr === appt.dateStr && a.timeStr === appt.timeStr
    );
    if (conflict) {
      return { success: false, error: `Slot ${appt.timeStr} on ${appt.dateStr} is already booked by ${conflict.attendeeName}.` };
    }

    const created: BookedAppointment = {
      ...appt,
      id: 'cal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      createdAt: Date.now(),
    };
    this.appointments.push(created);
    this.save();
    return { success: true, appointment: created };
  }

  cancelAppointment(id: string): boolean {
    const before = this.appointments.length;
    this.appointments = this.appointments.filter(a => a.id !== id);
    if (this.appointments.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  exportIcs(appt: BookedAppointment): string {
    const cleanDate = appt.dateStr.replace(/-/g, '');
    const [h, m] = appt.timeStr.split(':').map(Number);
    const startTime = `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
    const endMinutes = m + appt.durationMinutes;
    const endHour = h + Math.floor(endMinutes / 60);
    const endRemMin = endMinutes % 60;
    const endTime = `${String(endHour).padStart(2, '0')}${String(endRemMin).padStart(2, '0')}00`;

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AnF//CalDesk//EN',
      'BEGIN:VEVENT',
      `UID:${appt.id}@anf.local`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${cleanDate}T${startTime}`,
      `DTEND:${cleanDate}T${endTime}`,
      `SUMMARY:${appt.title}`,
      `DESCRIPTION:${appt.notes || 'Cal.com appointment scheduled via AnF.'}`,
      `ATTENDEE;CN=${appt.attendeeName}:mailto:${appt.attendeeEmail}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }
}

/**
 * Visual Cal.com Scheduling Desk Component
 */
export function createCalDeskPanel(manager: CalDeskManager, notify?: (msg: string) => void): HTMLElement {
  const container = h('div', { class: 'cal-desk-panel' });

  let selectedDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let selectedTimeSlot: string | null = null;

  const header = h('div', { class: 'cal-desk-header' },
    h('div', { class: 'cal-desk-title-wrap' },
      h('strong', { text: 'Cal.com (Cal.diy) Scheduling Desk' }),
      h('span', { class: 'badge quiet', text: 'Self-Hosted' })
    ),
    h('p', { class: 'hint', text: 'Select a day and time slot to book an appointment with automatic conflict prevention and ICS calendar export.' })
  );

  const mainLayout = h('div', { class: 'cal-desk-layout' });
  const leftCol = h('div', { class: 'cal-desk-left' });
  const rightCol = h('div', { class: 'cal-desk-right' });

  // Date picker input
  const dateInput = h('input', {
    type: 'date',
    class: 'cal-date-picker',
    value: selectedDate,
    'aria-label': 'Select Appointment Date',
  }) as HTMLInputElement;

  const slotsGrid = h('div', { class: 'cal-slots-grid' });
  const bookingForm = h('div', { class: 'cal-booking-form' });

  const titleInput = h('input', { type: 'text', placeholder: 'Meeting Title (e.g. Design Sync)', value: 'Product Consultation' }) as HTMLInputElement;
  const nameInput = h('input', { type: 'text', placeholder: 'Attendee Name', value: 'Alex Morgan' }) as HTMLInputElement;
  const emailInput = h('input', { type: 'email', placeholder: 'Attendee Email', value: 'alex@example.com' }) as HTMLInputElement;
  const durationSelect = h('select', { 'aria-label': 'Duration' },
    h('option', { value: '15', text: '15 minutes' }),
    h('option', { value: '30', text: '30 minutes', selected: true }),
    h('option', { value: '60', text: '60 minutes' })
  ) as HTMLSelectElement;
  const notesInput = h('textarea', { placeholder: 'Meeting notes or agenda…', rows: 2 }) as HTMLTextAreaElement;

  const confirmBtn = h('button', { type: 'button', class: 'primary', text: 'Confirm Booking' }) as HTMLButtonElement;

  function renderSlots(): void {
    slotsGrid.replaceChildren();
    const slots = manager.getSlotsForDate(selectedDate);
    for (const slot of slots) {
      const btn = h('button', {
        type: 'button',
        class: `cal-slot-btn ${slot.available ? '' : 'slot-booked'} ${selectedTimeSlot === slot.time ? 'slot-selected' : ''}`,
        text: `${slot.time} ${slot.available ? '' : '(Booked)'}`,
        disabled: !slot.available,
        onclick: () => {
          selectedTimeSlot = slot.time;
          renderSlots();
        },
      });
      slotsGrid.append(btn);
    }
  }

  dateInput.addEventListener('change', () => {
    selectedDate = dateInput.value;
    selectedTimeSlot = null;
    renderSlots();
    renderAppts();
  });

  confirmBtn.addEventListener('click', () => {
    if (!selectedTimeSlot) {
      notify?.('Please select an available time slot first.');
      return;
    }
    const title = titleInput.value.trim() || 'Scheduled Meeting';
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    if (!name || !email) {
      notify?.('Please enter attendee name and email.');
      return;
    }

    const res = manager.bookAppointment({
      title,
      attendeeName: name,
      attendeeEmail: email,
      dateStr: selectedDate,
      timeStr: selectedTimeSlot,
      durationMinutes: Number(durationSelect.value) || 30,
      notes: notesInput.value.trim(),
    });

    if (res.success && res.appointment) {
      notify?.(`Booked ${title} for ${res.appointment.dateStr} at ${res.appointment.timeStr}!`);
      selectedTimeSlot = null;
      renderSlots();
      renderAppts();
    } else {
      notify?.(res.error || 'Failed to book appointment.');
    }
  });

  bookingForm.append(
    h('span', { class: 'eyebrow', text: 'BOOKING DETAILS' }),
    titleInput,
    nameInput,
    emailInput,
    durationSelect,
    notesInput,
    h('div', { class: 'row' }, confirmBtn)
  );

  leftCol.append(
    h('span', { class: 'eyebrow', text: 'AVAILABLE TIME SLOTS' }),
    dateInput,
    slotsGrid,
    bookingForm
  );

  // Right Column: Booked appointments list
  const apptsList = h('div', { class: 'cal-appts-list' });

  function renderAppts(): void {
    apptsList.replaceChildren();
    const appts = manager.getAppointments();
    if (!appts.length) {
      apptsList.append(h('p', { class: 'hint', text: 'No upcoming appointments booked yet.' }));
      return;
    }

    for (const a of appts) {
      const card = h('div', { class: 'cal-appt-card' });
      const head = h('div', { class: 'cal-appt-head' },
        h('strong', { text: a.title }),
        h('span', { class: 'badge', text: `${a.dateStr} @ ${a.timeStr}` })
      );
      const details = h('p', { class: 'hint', text: `With ${a.attendeeName} (${a.attendeeEmail}) · ${a.durationMinutes} mins` });

      const exportIcsBtn = h('button', {
        type: 'button',
        class: 'chip',
        text: 'Export .ics',
        onclick: () => {
          const ics = manager.exportIcs(a);
          const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = h('a', { href: url, download: `meeting-${a.dateStr}-${a.timeStr.replace(':', '')}.ics` }) as HTMLAnchorElement;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          notify?.('Downloaded iCalendar (.ics) invite.');
        },
      });

      const cancelBtn = h('button', {
        type: 'button',
        class: 'danger chip',
        text: 'Cancel',
        onclick: () => {
          manager.cancelAppointment(a.id);
          renderSlots();
          renderAppts();
          notify?.('Appointment cancelled.');
        },
      });

      card.append(head, details, h('div', { class: 'row' }, exportIcsBtn, cancelBtn));
      apptsList.append(card);
    }
  }

  rightCol.append(
    h('span', { class: 'eyebrow', text: 'UPCOMING APPOINTMENTS' }),
    apptsList
  );

  mainLayout.append(leftCol, rightCol);
  container.append(header, mainLayout);

  renderSlots();
  renderAppts();
  manager.subscribe(() => {
    renderSlots();
    renderAppts();
  });

  return container;
}
