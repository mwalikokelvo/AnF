# Windows 0.1.26 — configurable connected tools

Local preview build, not a published or security-approved final release.

Open **Settings → Connected services** to configure your own gateway,
Open Notebook, Nextcloud, Cal.diy, n8n or Muapi endpoint. Save and enable the
chosen connection. API keys/passwords remain in the operating system credential
store; saving does not contact the service. Remote HTTPS or loopback HTTP only.
The private n8n webhook path is not read back into the form; blank keeps it.

Initial working flows:

- **Chat:** explicitly choose the configured AI gateway or offline AI. Gateway
  questions send the selected context to that service. The default remains local.
- **Research:** list notebooks and sources, import processed source text and
  preview an export to a selected notebook. Source creation is asynchronous.
- **Backups:** transfer existing encrypted `.anfpack` files to/from a configured
  WebDAV directory without overwriting remote files. Restore downloaded packs
  through the existing passphrase restore control.
- **Scheduling:** open a configured booking page and complete scheduling there.
- **Automation:** preview and send only draft title/text to an n8n webhook with
  an event ID. Configure receiver deduplication; delivery is not workflow success.
- **Media:** preview a text prompt, submit a compatible model job, retain its ID,
  check status and open HTTPS outputs. Charges may apply. No paid auto-retry.
- **Skills:** preview/export a ZIP with SKILL.md, reviewed draft, exact extracted
  reference text, source hashes and page/OCR coverage metadata. Review before
  manually installing it in an agent.

Chat also includes research, skill-draft, podcast-script and creative-brief tasks
in a compact picker. Writing edit/review prompts preserve voice and avoid
unsupported additions. Generated skill drafts remain unverified until reviewed.
Podcast scripts are text, not synthesized audio.

No service instance or account was supplied, so upstream deployments and real
account behavior remain unverified. Cal.diy direct booking mutations, continuous
Nextcloud sync, chapter-level conversion, podcast audio and advanced media
parameters remain follow-on work. Android has no new native connector or APK
in this Windows-first increment. Native Spotube changes from 0.1.25 are retained;
the earlier provider-authentication limitation is not claimed resolved here.

Validation covers native loopback contracts, credential and URL boundaries,
browser action previews, workflow/skill limits and existing regressions. See
[Connected features](CONNECTED-FEATURES.md) for details and the remaining final
Strix security gate. `node scripts/security/strix.mjs --check` currently reports
missing Strix/Docker; no security scan has passed.

Before installing, quit the running AnF instance from its tray menu. Existing
project schemas and production application identity remain unchanged. Connection
secrets are excluded from project backup exports; save them separately if needed.
