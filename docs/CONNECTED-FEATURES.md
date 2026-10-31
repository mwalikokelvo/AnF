> Windows 0.1.28 adds local entry points for every Home tool category: offline AI research, writing and skill drafts, calendar export, SVG storyboards, workflow checklists and encrypted local backups. Online adapters remain optional. These local counterparts do not bundle the six third-party servers. See [0.1.28 implementation and limits](IMPROVEMENTS-0.1.28.md).

# Connected features and learning workflows

Requested 2026-10-16. This is the implementation backlog for the eight linked
projects and the final Strix check. Status distinguishes AnF features from
connections to upstream applications. No upstream service has been installed,
connected, bundled or given access to saved documents in this increment.

## Implemented in Windows 0.1.26

**0.1.27 visibility update:** all eight tools now have Home cards with explicit
setup badges and direct navigation. Connected cards expand their specific
Settings section; Writing review and Books → skills open built-in controls.
Skill export includes a direct draft-preparation action. Adapter scope is unchanged.

The Windows workspace now has **Settings → Connected services**, with six
independent, initially unconfigured adapters. The user confirmed that no service
instances exist yet; hosting and real account validation are therefore pending.
There is no automatic server installation, remote upload or background rule.

- **OmniRoute/OpenAI-compatible gateway:** save an API base ending in `/v1`,
  model and gateway key. Test with the models endpoint. Choose Gateway in Chat
  to send the selected context explicitly; offline AI remains the startup
  default. Gateway errors do not silently reroute to another cloud provider.
  Paired-phone requests continue to use local AI.
- **Open Notebook:** list notebooks and their sources, import processed text,
  and preview/export a selected loaded source to an existing notebook using
  asynchronous text-source creation. Source IDs are shown; processing completion
  and embeddings remain managed by Open Notebook. No automatic export retry.
- **Nextcloud:** configure an existing WebDAV directory, username and app
  password. Upload a chosen encrypted `.anfpack` under a new generated filename
  with `If-None-Match: *`. Download by filename to a local encrypted pack; use
  AnF's existing passphrase restore to create new project copies. This is backup
  transfer, not continuous synchronization or remote conflict resolution.
- **Cal.diy:** configure and test a booking page, then open it to select a time
  and complete scheduling in that service. AnF does not directly create, cancel
  or reschedule bookings through an unverified API version.
- **n8n:** configure the production webhook and optional bearer secret. Preview
  and explicitly send the current draft title/text with an event ID and
  idempotency header. The receiving workflow must deduplicate event IDs.
  A successful webhook response acknowledges delivery, not downstream success.
- **Creative media/Muapi:** configure the API root, API key and a text-generation
  model endpoint. Preview a prompt, submit one job and retain its ID; manually
  check status and open returned HTTPS outputs. The last job ID survives reload.
  No automatic paid retry, file uploads, cancellation API or cost estimate is
  claimed. A model requiring additional parameters may reject this minimal
  text-only request; choose a compatible endpoint.

For n8n and media, **Validate address** is a local URL check; it sends no test
request that could trigger a workflow or paid job. It is not authentication
verification. Saving configuration also sends no network request. Forget removes
the local credential-store entry without deleting remote content.

Connection records and secrets are held in the OS credential store, separate
from saved projects and support exports. A retained secret cannot be moved to a
different origin without entering a replacement or explicitly clearing it.
Redirects are blocked and response bodies are bounded. Remote HTTP is refused;
loopback HTTP supports separately hosted local services. Imported sources and
results are rendered as text. New connection commands require the workspace
window. URL queries and fragments are excluded from configuration; signed HTTPS
output links may retain query parameters when explicitly opened.

**Skill bundles:** Writing now previews and saves a real ZIP containing a safe
`SKILL.md`, the reviewed draft, extracted source references and `coverage.json`
with SHA-256 hashes and available page/OCR metadata. Archive names are
allowlisted. This does not install agent instructions or prove full-book/model
coverage. Chapter-level conversion remains a later enhancement.

The remaining chapter processing, podcast audio, continuous sync, direct booking
API and richer media orchestration below are follow-on work, beyond these first
working adapters.

## Shared local workflows

Chat's task picker now prepares a cited research brief, source-based skill draft,
two-speaker podcast script, or image/video production brief. Existing highlight,
comparison, editing and action-item tasks remain in the same picker. Preparing
a task fills the question and context selector; it does not send a request.
Windows uses the existing local AI when the user asks. Android retains its
paired-PC and reviewed browser-copy paths and document-sharing controls.

Writing's existing edit/review actions now ask for specific, restrained edits
that preserve voice, avoid invented claims and do not speculate about AI
authorship. Suggestions still require acceptance in the writing editor.

Skill output is an AI-generated **draft**, based on selected excerpts. It is
not full-book conversion, a verified agent skill, or an installed plugin.
Review citations, coverage, example correctness and instructions before using
it. Existing Markdown export can save the reviewed draft. Podcast output is
text; creative briefs do not submit media jobs. Model output quality and
frontmatter validity still require review, especially with the smaller model.

These are original AnF prompts inspired by the requested capabilities. No
upstream skill text, scripts or application source was copied into the product.
The existing 0.1.25 installer/ZIP do not include these additions; the new Windows
candidate is 0.1.26. Android has the shared task picker, but no native service
adapter or new APK is claimed in this Windows-first increment.

## Upstream fit and further depth

| Project and verified upstream facts | Place in AnF | Next deliverable and acceptance check |
| --- | --- | --- |
| [Open Notebook](https://github.com/lfnovo/open-notebook): MIT; research notebooks, cited chat, REST API, podcast generation; separate UI/API/database deployment. | Documents → research notebooks; Audio → reviewed podcast production. | Optional connector to a user-owned instance. Pick a notebook and explicitly export selected sources; preserve upstream IDs and citations on import. Test create/list/import, unavailable server, duplicate retry and deletion. Local research/script tasks are available in source; the exchange adapter is implemented. |
| [no-ai-slop](https://github.com/petergyang/no-ai-slop): MIT writing skill, rather than an app server. | Existing Writing review and edit controls. | Original voice-preserving prompts are in source now. Next add a review rubric and representative before/after evaluations; edits must preserve names, numbers, quotes and technical meaning. Do not claim an AI-authorship detector. |
| [book-to-skill](https://github.com/virgiliojr94/book-to-skill): MIT converter for structured agent skills with chapter references. | Documents → skill draft → Writing → Markdown export. | Excerpt-based draft prompt is in source. Next build chapter-level processing with a coverage ledger and references bundle, validated frontmatter and export preview. Test a known multi-chapter fixture and missing/OCR text. Avoid auto-installing generated instructions; observe source-document rights. |
| [OmniRoute](https://github.com/diegosouzapw/OmniRoute): MIT gateway with OpenAI-compatible chat completions and bearer authentication. | Settings → AI connections; shared model selection. | Explicitly selected gateway provider, endpoint, model and key in native credential storage. Test models/chat with a local fixture, 401/429, cancellation and unavailable routes. Separate gateway history from direct-provider history. Never silently move private questions between cloud providers. The initial configurable adapter is implemented; deployment validation is pending. |
| [Open Generative AI](https://github.com/Anil-matcha/Open-Generative-AI): MIT studio; cloud generation uses Muapi submit/poll APIs and an API key; local-model options also exist. | A contextual creative tool opened from Writing/Audio. | Production brief is in source now. Next add an optional job adapter: explicit prompt/asset preview, displayed provider and cost information when available, submit once, persist job ID, poll and import outputs. Test failed jobs, cancellation, restart recovery and duplicate-submit prevention. Cloud models are not automatically free or local because the UI is open source. |
| [Cal.diy](https://github.com/calcom/cal.diy): MIT self-hosted scheduler; upstream recommends personal, non-production use. | Home → planning and booking links. | Start with a configured booking-page handoff. Add availability and booking only against a tested deployment/API version. Show timezone and attendee preview; require explicit booking/rescheduling/cancellation. Test daylight-saving changes and duplicate clicks. Hosting and calendar authorization are required; the initial booking-page connection is implemented. |
| [Nextcloud Server](https://github.com/nextcloud/server): AGPL-3.0 server; [documented WebDAV file operations](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/basic.html). | Settings → backup/sync destination; Documents → explicit imports. | First upload/download an encrypted backup using a scoped app password, then add conflict-aware sync using ETags. Restore into a test profile before enabling regular sync. Test offline retry, interrupted uploads, conflicts and revoked credentials. Keep the existing local vault and paired-PC transport intact. Server redistribution/modifications require a separate license review. |
| [n8n](https://github.com/n8n-io/n8n): Sustainable Use/Enterprise licensing; [webhook triggers](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) support external workflows. | Settings → Automations; contextual actions on a selected note or draft. | Explicit user-owned webhook connection and a reviewed minimal payload, initially a note/task export. Test authenticated delivery, failure, duplicate event IDs and disabled rules. Do not ship an unrestricted remote-command bridge. Review [license terms](https://docs.n8n.io/sustainable-use-license/) before embedding, reselling or offering managed access. The explicit webhook adapter is implemented; no automation is active. |

The licensing entries describe upstream declarations at research time, not a
blanket redistribution decision. Pin and review the exact revisions and
transitive assets before incorporating third-party code.

## Delivery order

1. **Local workflows — implemented:** one picker, reusable prompts and existing
   source selection. Preparation sends no service request.
2. **Connection infrastructure + OmniRoute — initial adapter implemented:** native
   credentials, endpoint validation, bounded requests, gateway cancellation,
   explicit provider selection and connection errors. Upstream instance checks
   await configuration.
3. **Research + learning — exchange and skill ZIP implemented:** chapter-level
   analysis and optional podcast audio remain subsequent work.
4. **Storage + planning — initial flows implemented:** Nextcloud encrypted
   backup transfer and Cal.diy handoff precede continuous sync and direct booking
   mutations.
5. **Automation + media — initial adapters implemented:** n8n payload previews
   and explicit media submissions/status. Richer job/automation orchestration
   remains subsequent work, without adding permanent sidebar sections.
6. **Platform validation and release security gate**: Windows first, then Android,
   Linux and portable packages; iOS remains dependent on Mac/signing access.
   Run Strix as described below, fix and retest findings before final release.

## Connection contract for subsequent increments

Keep remote service operations in native adapters, separate from DOM rendering.
The initial adapter records live entirely in the OS credential store. Future
capability preferences in app settings should retain only credential references,
with disabled-by-default state. Secrets stay out of project JSON,
backups, prompt history, URLs, analytics and support exports. Remote HTTPS is
required; local HTTP exceptions are explicit and restricted to loopback.
Reject URL userinfo, unexpected schemes and cross-origin redirects. Bound
response sizes and request duration; avoid echoing upstream bodies containing
secrets. Test connection means reachability/authentication, not permission to
transfer a notebook, create a booking or run a workflow.

Each export/import/job records the service, remote ID, local project revision,
payload purpose and outcome. Mutating retries need service-supported idempotency
or reconciliation, never blind replay. A disconnected service leaves the local
workspace usable. Background work must be visible and independently stoppable.
No connector is marked functional until a deployed instance passes its contract
and user-flow checks; fixtures alone prove only AnF's side of the interface.

## Impact and recovery

This increment adds native connection/skill commands and the Windows connection
panel, plus an optional `gateway` argument to `workspace_ask`. Omitted arguments
preserve local behavior. Saved project schemas and the native Spotube runtime
are unchanged. Remove connection entries using Forget before rolling back to
0.1.25; older versions ignore those credential-store records. Remote uploads and
jobs are user-triggered effects and are not undone by rolling back binaries.
Downloaded/restored projects remain ordinary independent copies.

Verification includes 67 passing native Rust tests (12 optional live tests
ignored), including loopback service contracts, secret-origin retention,
redirect/size failures and ZIP filename constraints; TypeScript; Windows web
build; workflow and skill-pack checks; nine existing regressions; 84 rendered
views; and a separate connected-service browser user-flow suite. Browser service
flows use fixture IPC. Real upstream deployments/account behavior remain
unverified until configured; generated answer quality is not established by
contract tests. Actual native WebView2/Tauri checks passed for a temporary
Credential Manager entry, gateway HTTP/source context, non-workspace command
denial and real skill ZIP CRC/content; the test credential was removed. Windows
0.1.26 installer and portable ZIP were built; all 593 archived files match the
portable folder and native SDK, with ZIP CRC and SHA-256 checks passed.

## Strix — required final release check

User explicitly requested [Strix](https://github.com/usestrix/strix) at the end
of the build-ups. **Pending, not passed.** Strix and Docker were not found on
this shell's PATH during this increment; that does not prove they are absent
elsewhere. The [local quick start](https://docs.strix.ai/quickstart) requires
running Docker and configured LLM access. Do not count a preflight or normal
regression suite as a completed penetration test.

Executable entry point: `node scripts/security/strix.mjs --check` checks CLI and
Docker availability without scanning. `--run` stages an allowlisted source copy,
records per-file hashes and invokes Strix with the bounded AnF-only assessment
instructions. It excludes `.git`, credentials, model weights and build outputs.
Reports and the source manifest remain under `windows/target/security-review-*`.
The current preflight reports missing Strix/Docker and no scan started.

Before the final release:

- Install a reviewed, pinned Strix version into the development environment.
  Configure an authorized model without committing credentials. Use a disposable
  profile and synthetic documents/accounts. Exclude real provider credentials,
  vault keys, user files, binaries, model weights and build caches from scan
  inputs. Source passed to the scanner's model follows the chosen provider's
  data handling, even when the CLI runs locally.
- Prepare an allowlisted copy of the final release's application source and
  integration adapters. Scan that directory using the documented
  `strix --target <review-source-directory>` command. Add live test targets only
  for AnF-owned test deployments. Never scan Spotify, provider APIs or unrelated
  servers; their URLs in application code are not scan authorization.
- Cover Tauri command authorization, untrusted documents/prompt injection,
  generated skill instructions, URLs/redirects/SSRF, file paths/export/import,
  vault and pairing, connector secret storage, webhook authentication/replay,
  native player IPC and dependency exposure. Strix complements native Windows
  testing and does not establish native UI or audio correctness.
- Preserve the exact source revision (and a patch hash for dirty source), Strix
  version, scope, model, scan date, redacted report and limitations. Triage each
  finding, fix confirmed issues and retest. Release remains gated until material
  findings are resolved or an explicit release decision records the residual
  risk. A blocked/partial scan remains pending, never a pass.

Record completion and report location in the local build status and release
validation notes so this request survives future sessions.
