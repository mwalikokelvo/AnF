# Windows 0.1.27 — visible tool access

The installed 0.1.26 already contained the connection adapters and skill-export
commands. They were too hard to discover inside Settings, and the unchanged
Home screen made the new features appear absent.

Home now presents eight tool cards immediately after its heading:

- Open Notebook research exchange.
- Built-in writing review.
- Books → skills, including draft preparation and reviewed export.
- OmniRoute / compatible AI gateway.
- Creative media through Muapi.
- Cal.diy scheduling-page access.
- Nextcloud encrypted backup transfer.
- n8n draft webhooks.

Each connected card opens its own expanded Settings section and focuses the
address field. Built-in tools open their relevant writing controls.
Home navigation resets the page scroll to the top, so returning from a scrolled
Settings or Writing page cannot hide the first tool cards. The skill
export panel now explains the steps and has a direct Prepare skill draft in
Chat action. Without a source, it directs the user to Documents first.

Setup badges come from the saved local configuration only. They distinguish
Needs service setup, Disabled and Enabled; they do not claim server reachability.
Refreshing Home reads credential metadata without contacting remote services.

This fixes visibility and navigation. It does not install external servers or
expand the adapter scope described in [0.1.26](IMPROVEMENTS-0.1.26.md). The six
optional services still require user-owned instances/accounts; the two local
workflows use AnF's existing document, writing and AI capabilities. Strix remains
pending, as recorded in [Connected features](CONNECTED-FEATURES.md).

Validation: TypeScript, 84 rendered Windows/Android views with new Home/skill
navigation assertions, and the release checks including workflow/skill limits.
Actual native Windows checks pass for Home shortcuts, writing focus, no-source
guidance and returning Home at scroll position zero. Package verification passes
for all 593 files, embedded frontend, native SDK, ZIP CRCs and SHA-256.
Installer and portable artifacts are recorded in local build status.
No project-schema, credential-format or native music runtime changes.
