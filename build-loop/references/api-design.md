# API & Interface Design

Open this when a slice adds or changes an HTTP/GraphQL endpoint, an IPC or command interface (e.g. Tauri commands, Electron IPC), a plugin/extension API, a module boundary, or any public type other code depends on.

## Principles

**Hyrum's Law.** With enough users, every observable behaviour of an interface — including error messages, ordering, and timing — will be depended on by somebody. Treat everything observable as a commitment and expose as little as you can.

**One version.** Prefer evolving one interface compatibly over running parallel versions. Two versions double the maintenance and testing forever.

**Contract first.** Define the types/schema of inputs, outputs, and errors before implementing either side. The contract is the spec for both sides and lets UI and backend slices proceed against it (a mock that satisfies the contract is a valid first slice).

**Validate at the boundary.** Parse untrusted input into a typed value once, at the edge (route handler, IPC handler, plugin loader), with a schema: shapes, lengths, enums, formats. Internal code uses only the parsed value. Return structured validation errors.

**Prefer addition over modification.** New optional fields, new endpoints, new commands — not changed meanings of existing ones. Removing or renaming something public goes through `references/migrations.md`.

**Predictable naming.** Follow the project's existing conventions exactly (plural resource nouns, verb-less REST paths, consistent casing). Consistency beats your preference.

## Errors

- One error shape everywhere, e.g. `{ error: { code: "ENTRY_NOT_FOUND", message: "...", details?: ... } }`.
- Stable machine-readable `code`s; human messages may change, codes may not.
- Correct status semantics: 400/422 bad input, 401 unauthenticated, 403 not allowed, 404 missing, 409 conflict, 429 rate limited, 5xx server fault. Never 200-with-error-body.
- No stack traces or internal details in responses.

## Lists, updates, retries

- **Paginate every list endpoint from the start** (cursor-based for data that changes; include a `next` cursor). An unbounded list is a future outage.
- Filtering and sorting via explicit, allowlisted query params.
- Partial updates use PATCH semantics (only provided fields change); full replacement is PUT.
- **Idempotency:** any create/charge/send operation a client might retry should accept an idempotency key, *store it with the result*, and return the stored result on repeat. Accepting the header without honouring it is worse than not accepting it. Queues are at-least-once — make consumers idempotent.

## Types (TypeScript examples; apply the idea in any typed language)

- Model variants as discriminated unions (`{ status: "ok"; data } | { status: "error"; error }`) rather than many optional fields.
- Separate input types from output types (`CreateEntryInput` vs `Entry`) — server-generated fields never come from the client.
- Use distinct ID types where the language allows (branded types, newtypes) so an `EntryId` can't be passed where a `UserId` is expected.
- Avoid `any`/`unknown` leaking across the boundary; an explicit type usually removes downstream branching.

## Plugin / extension interfaces

These are the hardest interfaces to change because you don't control the callers. Keep the surface tiny, version it explicitly (`apiVersion` in the manifest), give plugins only the capabilities they declare, and treat plugin code and data as untrusted (see `references/security.md`).

## Verify

- [ ] Contract (types/schema) written before implementation and checked in
- [ ] Every input validated at the boundary; tests cover invalid input
- [ ] Errors use the shared shape and correct status codes
- [ ] List endpoints paginate
- [ ] No existing consumer breaks (search for callers; run their tests)
- [ ] Interface documented where the project documents interfaces (types/doc comments, OpenAPI, README)

## Excuses vs. reality

| Excuse | Reality |
|---|---|
| "We'll document the API later" | The types are the documentation. Define them first. |
| "We don't need pagination yet" | You will the moment someone has 100+ items. |
| "Nobody uses that undocumented behaviour" | Hyrum's Law: if it's observable, someone depends on it. |
| "Internal APIs don't need contracts" | Internal callers are still callers; contracts enable parallel slices. |
| "Duplicate requests are rare" | They cluster exactly when a dependency is degraded and retries spike. |
