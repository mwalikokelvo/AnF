# Migrations & Deprecation

Open this when a change alters stored data shape (database schema, saved files, settings format, local storage), or renames/removes anything other code, users, plugins, or saved data depend on.

## Code is a liability

Every feature, flag, and compatibility shim has an ongoing cost. Plan removal at design time: when you add something with a lifetime (a flag, a shim, an old format reader), write down in the spec when and how it goes away.

## Data schema changes: expand / contract

Old and new code run at the same time during any rollout (and on users' machines that haven't updated yet). So never rename or drop in place.

1. **Expand** — add the new column/field/format alongside the old. New code writes both (or writes new, reads both).
2. **Migrate** — backfill existing data to the new shape, in batches, idempotently (safe to re-run).
3. **Switch reads** — new code reads only the new shape.
4. **Contract** — in a *separate, later* change, once nothing references the old shape, remove it.

Rules:
- Every migration has a `down` path, written and **run** locally before merging. A migration you can't reverse is a deploy you can't reverse.
- Never couple a safe add with a destructive drop in the same migration.
- Test the migration on a copy of realistic data, including empty, huge, and malformed rows.
- Local app data (SQLite, JSON settings, IndexedDB): version the format (`schemaVersion`), migrate on load step by step (v1→v2→v3), keep a backup of the previous file until the migration succeeds, and never crash on an unknown newer version — refuse gracefully.

### Backups and offline data

Apps that keep data on the device (a private library, notes, settings) make users depend on two promises: an upgrade never loses data, and a backup made by an older version still restores in the newer one.

- Every format change comes with a test that restores a backup written in the **previous** format (keep a small fixture file per format version).
- Upgrades migrate in place, in the background if slow, and keep the original until the migrated copy is confirmed.
- If a change means older app versions can no longer open the data or restore the new backups, that's a one-way door: say so plainly in the release notes and changelog ("update every device before moving a library").
- Never tell users to uninstall/reinstall to fix something when uninstalling deletes their data.

In autonomous mode: you may write and test migrations, and run them against a **local dev** database. Running them against shared/production data, or doing the *contract* (drop) step, is an irreversible action — prepare it and hand over the command (see SKILL.md §8).

## Removing or renaming public things

Hyrum's Law: someone depends on it. For APIs, commands, plugin interfaces, config keys, CLI flags:

1. **Build the replacement** and make it fully work.
2. **Announce** — mark the old thing deprecated (doc comment, runtime warning, changelog entry) with the replacement and a migration example.
3. **Migrate callers** you control yourself; provide a codemod or clear guide for those you don't. Users don't migrate on their own.
4. **Remove** only when usage is zero (or the announced date passed) — in its own change.

Prefer an adapter (old interface implemented on top of the new) over maintaining two implementations. For gradual replacement of a whole subsystem, route traffic through a facade and move pieces one at a time (strangler pattern), with a flag to switch back.

## Zombie code

Code nobody owns and nobody can explain — unused, unreachable, or only kept "just in case". Don't silently delete it during a feature (scope discipline); list it under *Noticed, not touched* in the plan with evidence it's unused (no references, no traffic), so it can be removed deliberately.

## Excuses vs. reality

| Excuse | Reality |
|---|---|
| "Just rename the column, it's one line" | During rollout old code queries a column that no longer exists. Expand/contract. |
| "Add the new and drop the old in one migration" | That couples a safe change to a destructive one. Drops get their own deploy. |
| "We'll write the rollback if we need it" | Write and run the `down` before merging. |
| "Someone might need it later" | If so, it can be rebuilt. Keeping it costs every day. |
