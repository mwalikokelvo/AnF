# Replica track — rebuild an existing app's features as your own

Use this track when the request is to build your own version of an existing app or of one of its features: "clone X", "build my own X", "make it work like X", "a Spicetify-style marketplace", "reverse-engineer how X does Y". It replaces build-loop's Clarify and Spec with a recon of the original, adds parity and rebrand gates before shipping, and optionally finds what the original's users hate so your version has a reason to exist.

Adapted from Jake Schincariol's [Replica skill](https://github.com/Jakeschincariol/replica-skill) (MIT). Its eleven stages are here as R1–R11; the tools and templates are in this skill's `scripts/` and `assets/replica/` folders.

**For one borrowed feature** (not a whole app), run R1 scoped to that slice, then the normal loop, then R7. The rest is for full products.

## Clean room: the rules that make this legitimate

It rebuilds **what an app does and how people move through it** — features, flows, UX patterns. It never takes **what the app owns**.

- **Public sources and the user's own account only.** Help docs, pricing, changelog, store listings, public walkthroughs, public API docs. Never log into someone else's account, never get past a login or paywall, never ask for a password.
- **Reading, not scraping.** Human-pace reading. No crawlers, bulk downloads, or loops against the original's servers. Never load-test or fuzz the original.
- **No source, no private APIs.** Don't read or save its JavaScript bundles, decompile its binaries, or record its network calls to copy endpoints. Integrations use official public APIs with the user's own keys.
- **Check the terms.** If the user's account terms forbid using it to build a competitor, say so and use public sources only.
- **Nothing owned ships.** Not its code, logos, icons, illustrations, sounds, licensed fonts, copy, or content (catalogue, network, partner deals). Screenshots of the original are reference only (`replica/screens/`) and never go into the product.
- **Every word is fresh.** Matching what a button does is parity; matching its sentence is copying.
- **Rebrand before launch, always.** New name, palette, logo, words. Deploy waits for a clean sweep.

**Forks are different.** If the project is a licensed fork or derivative of an open-source upstream (check `LICENSE` and the project's rules), you may reuse code as that licence allows — keep its notices and obligations — and the rules about reading source don't apply to that upstream. The rebrand rules still apply to anything user-visible; identifiers the project must keep stable for updates (bundle ids, storage keys) go in the sweep's allow list.

**Honesty rules carry through:** no invented reviews, quotes, counts, ratings, testimonials, user numbers, or check results. A clone at 62% parity is at 62%.

## Files

Everything lives in `replica/` in the project (the sweep skips it, because the original's name belongs there):

| file | written by | template |
|---|---|---|
| `recon.md`, `features.csv`, `screens/` | R1 | `assets/replica/recon-map.md`, `features.csv` |
| `architecture.md`, `schema.sql` | R2 | `assets/replica/architecture.md` |
| `design/tokens.json`, `tokens.css`, `components.md` | R3 | `assets/replica/tokens.json` |
| `clone-screens/` | R4 | — |
| `backend.md` | R5 | — |
| `test-plan.md`, `bugs.md`, e2e specs | R6 | `assets/replica/test-plan.md`, `bug-report.md`, `e2e.example.spec.ts` |
| `parity.md`, `diffs/` | R7 | — |
| `reviews.csv`, `feedback.md`, `fixes.md` | R8 | — (`scripts/themes.json` holds the themes) |
| `brand.md`, `brand.json` | R9 | — |
| `launch/` (`landing.md`, `pricing.md`, `listing.json`, `launch-plan.md`) | R10 | `assets/replica/listing.example.json` |
| `deploy.md` | R11 | `assets/replica/preflight.md` |

In this track, `recon.md` + `architecture.md` are the spec (put **Decisions made without asking** in `architecture.md`), and `features.csv` is the master checklist. The plan in `tasks/` still holds the slices, the Log, and the BLOCKED marks; each slice names its flow (F-id), screens (S-ids) and `features.csv` rows.

## How the stages map onto the loop

| stage | replaces / extends | gate before moving on |
|---|---|---|
| R1 Recon | §2 Clarify | recon map + feature matrix written, sized |
| R2 Architect | §3 Spec, §4 Plan | schema with access rules, build order = plan slices |
| R3 Design | `frontend-ui.md` | `contrast.py` 0 AA failures |
| R4 Build | §5 slices | per-screen done list |
| R5 Backend | §5 slices + `security.md` | security checklist ticked, second user sees nothing |
| R6 Test | §5–6 | no open S1 |
| R7 Diff | §6 Review | verdict "shippable" |
| R8 Entrepreneur | new | fixes added to `features.csv` |
| R9 Brand | new | `sweep.py` exit 0 |
| R10 Launch | new | `listing.py` exit 0 (if stores) |
| R11 Deploy | §7–8 | full preflight green, then §8 permission rules |

Tool paths below are relative to this skill's folder (`<skill>/scripts/...`).

---

## R1 Recon (in place of Clarify)

1. **Scope — decide, don't ask.** Which app and platform, which slice (default: the core loop, the one flow users pay for — "all of Notion" is not a project), who it's for. Log each choice under *Decisions made without asking*.
2. **Sources table**, a URL on every row, in order of value: help center/docs, pricing page (what they gate matters), changelog, store listing, public walkthroughs, marketing site, the user's own account, public API docs.
3. **Screen inventory**, stable ids: `ID | screen | route | purpose | key components | states seen`. Record states (empty, loading, filled, error, no permission, mobile) — an unrecorded empty state is one you won't build.
4. **Flows**, `F01 goal: S07 -> S08 -> S09 -> S10`, with edge cases and the happy-path click count (the number to beat).
5. **Components**: every repeated UI part with variants, states, and where used.
6. **Inferred data model**: entities, fields, relationships, each with evidence and confidence (high / medium / guess).
7. **Feature matrix** `replica/features.csv`: `feature,area,priority,original,clone,notes`; priority must/should/could; `clone` starts `no`.
8. **What can't be cloned**: `skip` rows with a reason — licensed content, the network and its users, data it owns, partner deals, hardware, regulated licences.
9. **Size it honestly**: S (a weekend), M (weeks), L (a quarter), XL (rescope). Name the hard parts (realtime, sync, payments, offline, integrations).

## R2 Architect (the spec's technical approach and the plan)

- **Stack: the project's existing stack wins.** For a new project with no preference, default to boring managed parts (e.g. Next.js + TypeScript, Postgres on Supabase/Neon, Stripe Checkout, Resend/Postmark, Vercel; Expo for mobile). One database, no microservices — the clone needs the original's features, not its architecture.
- **Schema**: uuid ids, `created_at`/`updated_at`, an owner column on everything a user owns, deliberate `on delete` rules, indexes on foreign keys and filter/sort columns, check constraints for statuses, `timestamptz` in UTC, money as integer cents plus currency, and **access rules written down** (row-level security or one authorisation check per query). Hard invariants the recon found (no double booking) go in the database as constraints.
- **API**: per flow, `method path | does | who | input | output | flow`, plus webhooks and background jobs with schedules. Official public APIs only.
- **Parts that bite**: time zones/DST, idempotency, races, rate limits, file limits, search, realtime, offline, email deliverability, multi-tenancy, deletion.
- **Build order → plan slices**: (1) the core loop end to end, ugly but working; (2) must-haves by area; (3) should, then could; (4) R8's fixes once known.

## R3 Design system

From the reference screenshots, **measure, don't guess**: colour *roles* (bg, surface, border, border-input, text, text-muted, accent, on-accent, danger, success, warning), type scale, spacing base (4 or 8), radius/shadow/motion, layout widths and breakpoints. Write `replica/design/tokens.json` (keep the role names; R9 only changes values), generate CSS variables / the framework's theme so components never use raw hex, and list every text/background pair:

```bash
python3 <skill>/scripts/contrast.py replica/design/tokens.json     # exit 1 on any AA failure
```

Use an open icon set and open fonts with the same job; put a neutral placeholder in `accent` (the original's brand colour is trade dress). Write a spec per component (variants, sizes, states incl. focus/disabled/loading/error, tokens, keyboard and screen-reader behaviour, screens used on) and build the primitives once, in isolation, before any screen. Everything in `frontend-ui.md` applies.

## R4 Build (the slice cycle, screen by screen)

Order: the shell (routes for every screen, layout, tokens, primitives, seed data) → the core-loop vertical slice (with a fake data layer that has the real function signatures if the backend isn't there yet) → screens in `architecture.md` order. Per screen, on top of §5's red → green → verify → commit:

- [ ] every state from the recon map, plus empty, error, loading, long content, no permission
- [ ] works at 390px and 1440px (or the platform's equivalents); completable by keyboard; no console errors
- [ ] no copy, assets or code borrowed from the original
- [ ] `features.csv` rows set to `yes` or `partial` (with a note)
- [ ] screenshot at the reference viewport saved to `replica/clone-screens/S07.png`

When a feature is bigger than it looked, say so in the plan log — don't quietly ship half. When stuck on how the original behaves, go back to it **as a user** (help article, walkthrough, own account), never its code. Once the shell and core slice exist, independent screens and flows are good candidates for parallel workers (§5a).

## R5 Backend

- **The user creates every account and key** (Stripe, Supabase, Resend, Google Cloud…) and puts them in `.env.local`; you write `.env.example` with names only. You never sign up, buy, or type passwords, cards, or live keys. Test mode until deploy.
- **Auth**: verified email sign-up, password reset, OAuth with the user's own apps, http-only secure cookies, roles via one "can this user do this to this record" function, account deletion that really deletes.
- **Database**: migrations checked in and scripted; access rules on every table, **tested with a second user who must get nothing**; realistic fake seed data; backups on.
- **Payments**: hosted checkout and customer portal (no card forms); webhooks verify signatures, store the event id, are idempotent; subscription state in your database; one-click cancel.
- **Email and jobs**: from the user's domain, templates written fresh; jobs with retries and a dead-letter log, times in UTC.
- **Integrations**: official API, fewest OAuth scopes, the provider's review timeline (Google sensitive scopes take weeks — start early).

Then walk `references/security.md` and keep `replica/backend.md` as the ticked checklist.

## R6 Test

Test **your** clone, never the original's servers. For every flow write the happy path, then go down the edge list: empty input, very long input, emoji and accents, two tabs, double submit, back/refresh mid-flow, slow network, offline, expired session, second user's data (must be invisible), time zones/DST, mobile width, keyboard only, screen-reader labels — plus negatives (wrong password, card declined `4000 0000 0000 0002`, permission denied, deleted record). Number cases `F01-H1`, `F01-E3`, `F01-N2`.

Automate what you can (e.g. Playwright, one spec per flow, role/label selectors, failing on console errors and 5xx, with an axe scan per screen — see `assets/replica/e2e.example.spec.ts`); click through the rest with browser tools, or give the user a checklist. Log every **reproduced** bug in `replica/bugs.md` (`assets/replica/bug-report.md`); "might be" goes in a to-check list:

| | means |
|---|---|
| S1 | data loss, security hole, payments wrong, core flow blocked |
| S2 | a feature broken, no workaround |
| S3 | broken with a workaround, or visibly wrong |
| S4 | cosmetic |

Fix S1 and S2 first with the §5 cycle (failing test first). Nothing ships with an open S1.

## R7 Diff — parity, measured

```bash
python3 <skill>/scripts/parity.py replica/features.csv                                  # score + missing list
python3 <skill>/scripts/imgdiff.py replica/screens/S07.png replica/clone-screens/S07.png --out replica/diffs/S07.png
python3 <skill>/scripts/imgdiff.py replica/screens/S07.png replica/clone-screens/S07.png --json > replica/diffs/S07.json
python3 <skill>/scripts/parity.py replica/features.csv --visual replica/diffs/*.json --markdown > replica/parity.md
```

Parity means **it does the same job**, not that it looks the same. `parity.py` weights must 3 / should 2 / could 1, counts partial as half, and ignores `skip` rows and features you added. `imgdiff.py` compares layout structure via edge maps and ignores colour, so the rebrand doesn't count against you (use `--mode pixel` only for your own regressions). Compare screenshots at the same viewport and state. Also walk each flow in both and note behaviour differences (clicks, errors, what's remembered, emails).

Verdict in `replica/parity.md`: **not shippable** (any must-have missing or an open S1), **shippable** (all must-haves, feature score 80+, no open S1/S2), **better than the original** (shippable plus R8's fixes — the goal; a straight copy has no reason to exist).

## R8 Entrepreneur — what the original's users hate

Not negotiable: **never fabricate** (no invented reviews, quotes, counts, ratings, sources; if there are 14 reviews, say 14); **every quote verbatim with its link**; **reading, not scraping** (copy rows by hand or use official feeds within their terms, e.g. Apple's customer-reviews RSS, the Hacker News Algolia API, Reddit's official API); **no fake reviews, ever**; reviewers' words are research, never testimonials.

Collect 100+ reviews across 3+ sources, recent first (stores, G2/Capterra/Trustpilot including 1–3 stars, Reddit "X alternative / switched from X", Hacker News, the original's feature-request board, and its changelog so you don't "fix" what's fixed). Rows `source,url,date,rating,text` in `replica/reviews.csv`; read the 3–4 star "love it, but…" reviews too.

```bash
python3 <skill>/scripts/reviews.py replica/reviews.csv --out replica/feedback.md   # edit scripts/themes.json for the category
```

It drops rows without links, weights low and recent ratings higher, marks thin themes (<3 reviews or one source), and lists low ratings that matched no theme — read those by hand. Write `replica/fixes.md`: three ranked lists (what they hate / what's missing / what's unsolved), each item with counts and one or two linked quotes; a fix plan of the top 5–8 by evidence × cheapness (added to `features.csv` with `original` = `no`); and three positioning angles ("For {who} who {hate this}, {your app} {does this instead}. Evidence: …"), recommending one. The original's name never goes in your name, ads or listing.

This research can run in parallel with R4–R6.

## R9 Brand

- **Name**: ~20 candidates across styles, cut to 5 that aren't confusingly similar to the original or other apps in the category (sound, look, meaning), are short and spellable, and fit the angle.
- **Checks — run, not assumed**: US/EU/Canada/WIPO trademark databases in the app's classes, domain, App Store and Play, social handles, a web search. Mark each *to run* or its result with the date; never write "available" for a check nobody ran. These are screening checks, not legal clearance — a trademark lawyer before spending money on the name.
- **Palette**: a primary hue from a different family than the original's, written into the same token roles; `contrast.py` with zero failures.
- **Logo brief** (not a logo): the idea, mark type, works at 16px and 1024px, deliverables (SVG, 1024 app icon without transparency for iOS, favicons, 1200×630 social image), and must not resemble the original's mark.
- **Voice**: three words with what each does *not* mean, five do/don't pairs, and the ten most-seen strings rewritten.
- **Sweep** until clean:

```bash
python3 <skill>/scripts/sweep.py . --config replica/brand.json    # avoid / domains / colors / allow
```

It finds the original's name (also inside identifiers), domains and brand colours in file contents and names. Use `allow` only for identifiers the project must keep stable (e.g. a legacy bundle id) and say why in `brand.md`; allowed hits are still printed. Check by eye too: favicon, titles, emails, social image, app icon.

## R10 Launch

No fake proof (testimonials, user counts, ratings, press logos) — an empty section beats a fake one; reviewers' quotes are not testimonials; the original's name stays out of everything.

- **Landing page**: hero = the angle; the top two "hate" themes in your own words; three-step how-it-works from the core flow; features led by the fixes (parity is the price of entry); pricing; real objections as FAQ; final call to action. Brand voice; contrast checked.
- **Pricing**: the original's public pricing and 2–3 alternatives with URL and date read; what reviewers said about price; at most three tiers named for who they're for; fix billing complaints in the product. The user creates the Stripe products.
- **Store listing**:

```bash
python3 <skill>/scripts/listing.py replica/launch/listing.json    # limits, claims, the original's name
```

  Apple's guideline 4.1 (copycats) rejects apps that only copy — make your fixes and brand visible in screenshots and the first lines. Also: screenshots at current sizes, privacy labels / data safety, policy and support URLs, age rating, review notes with a demo account.
- **Launch plan**: waitlist, analytics and error tracking live, where the original's unhappy users talk, a launch post leading with the fix, the first ten users to talk to.

## R11 Deploy

Preflight, all must pass (fill `assets/replica/preflight.md` into `replica/deploy.md`):

```bash
<the project's e2e/test command>
python3 <skill>/scripts/parity.py replica/features.csv          # all must-haves done
python3 <skill>/scripts/sweep.py . --config replica/brand.json   # exit 0
python3 <skill>/scripts/listing.py replica/launch/listing.json   # if shipping to stores
<the project's production build>
```

Plus: no open S1/S2, privacy policy and terms list every processor, account deletion works, favicon/titles/emails/icons are yours. Any failure stops the deploy — say which.

Then a separate production database with backups and migrations in the deploy, production env vars matching `.env.example`, payments in live mode with the webhook endpoint, OAuth redirect URIs for the production domain, a verified sending domain, the exact DNS records (A/CNAME for the host, SPF/DKIM/DMARC for email, one canonical host), error tracking, uptime checks, and the core flow done on the live site. For mobile: beta (TestFlight / Play internal) before review.

**Who does what**: the user buys domains and signs into accounts; you write the exact records, variable names, and commands. Going live follows build-loop §8 — do it only when the user says go or a standing permission covers it; otherwise finish the preflight and hand over the command.

## Excuses vs. reality (Replica)

| Excuse | Reality |
|---|---|
| "I'll just view source to see how they did it" | That's how a clean-room rebuild becomes a copy. Go back to it as a user. |
| "I'll reuse their icons/copy for now and swap later" | "Later" ships. Placeholders from open sets and your own words from the start. |
| "Parity means pixel-matching their screens" | Parity is the job it does. Their exact look is trade dress and changes at R9. |
| "These three angry comments show a trend" | Under 3 reviews or one source is thin. Say so. |
| "The name is probably free" | Mark the check *to run* until someone ran it. |
| "It's at 90%, close enough to ship" | Any missing must-have or open S1 means not shippable. |
