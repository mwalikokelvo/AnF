---
name: calcom
description: Open-source scheduling infrastructure, event booking, calendar sync, and availability engine (Cal.com / cal.diy). Use when implementing appointment booking, timezone-aware scheduling, calendar provider integration, or self-hosted scheduling workflows.
metadata:
  homepage: https://github.com/calcom/cal.diy
---

# Cal.com (cal.diy) — Open-Source Scheduling Infrastructure

Cal.com provides enterprise-grade, customizable appointment scheduling and booking infrastructure that can be completely self-hosted or embedded into web applications.

## Core Capabilities

1. **Timezone-Aware Scheduling & Availability**
   - Complex recurring availability schedules, blackout dates, buffer times, and minimum booking notice.
   - Automatic cross-timezone translation and daylight saving time adjustments.
   - Multi-host booking: round-robin, collective/panel meetings, and group event slots.

2. **Calendar & Meeting Connectors**
   - Google Calendar, Apple iCloud Calendar, Microsoft Outlook/Office 365, and CalDAV protocol support.
   - Video conference link generation: Google Meet, Zoom, Daily.co, and custom WebRTC links.
   - iCalendar (.ics) feed import and export.

3. **API & Embeddable Booking UI**
   - React embed component (`@calcom/embed-react`) and vanilla iframe/web-component embeds.
   - REST API and webhook dispatch on booking created, rescheduled, or cancelled.
   - Custom booking fields, questions, and payment processing (Stripe).
