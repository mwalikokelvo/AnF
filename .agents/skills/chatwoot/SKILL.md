---
name: chatwoot
description: Open-source customer engagement and omnichannel communication suite. Use when configuring support inboxes, live chat widgets, webhook event handling, customer conversation workflows, or integrating omnichannel messaging (Email, WhatsApp, Telegram).
metadata:
  homepage: https://github.com/chatwoot/chatwoot
---

# Chatwoot — Omnichannel Customer Engagement

Chatwoot is an open-source customer communication platform providing unified inboxes across website live chat, email, social messaging channels, and custom webhooks.

## Core Capabilities

1. **Omnichannel Inboxes & Routing**
   - Live chat widget integration with custom branding, welcome bots, and automated pre-chat forms.
   - Channel connectors: Email (IMAP/SMTP), WhatsApp Business API, Telegram, SMS, and custom API channels.
   - Conversation assignment, team routing, agent capacity management, and canned responses.

2. **Webhooks & API Integration**
   - Comprehensive REST API for contacts, conversations, messages, and attachments.
   - Webhook events (`conversation_created`, `message_created`, `conversation_status_changed`) for automated bots and CRM syncing.
   - HMAC signature verification for secure inbound webhook processing.

3. **Self-Hosted Deployment**
   - Docker Compose and Kubernetes deployment topologies.
   - Single-container or distributed architecture with PostgreSQL, Redis, and Sidekiq workers.
