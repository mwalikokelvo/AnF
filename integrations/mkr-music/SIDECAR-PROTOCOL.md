# Windows catalog sidecar protocol (engineering component)

This is an AnF-authored private pipe protocol for the isolated JVM catalog and
bounded media-input component. It is **not registered in AnF** and is not the
native player capability used by `mkr-player.ts`. Android must not package the
Windows JDK transport directory. No installer or available app source is supplied.

The owned parent launches the pinned catalog entry point
`com.anf.mkr.windows.WindowsCatalogSidecarKt` with private stdin/stdout and a fresh
256-bit lowercase-hex `ANF_MKR_SESSION_NONCE` environment value. Keep environment
values and stdout away from terminals, logs and frontend events. Never select
executables, JARs, working directories or arbitrary URLs from a UI request. A
parent supervisor must verify packaged resources, own the process lifetime,
terminate on protocol errors/timeouts and revoke native playback on process loss.

Each request is one strict UTF-8 JSON object followed by LF. Input is bounded to
65,536 bytes, replies to 1 MiB. Protocol is 1; positive request IDs must increase
by exactly one, beginning at 1. Unknown fields, malformed UTF-8, truncation and
nested/array request data fail closed. No raw input or upstream error cause is
echoed. Replies carry `id`, `ok`, and either a result or a safe error code. Parent
must enforce byte bounds, unique response IDs, protocol and result schema itself.

| Command | Request fields beyond protocol/id/command | Result |
| --- | --- | --- |
| `hello` | Fresh `nonce`, first request only | `protocol:1`, `catalog:true`, `leasedInput:true`, **`embedded:false`** |
| `search` | `query`, 1–500 characters | At most 100 sanitized tracks |
| `prepare` | `trackId`, valid 11-character catalog ID | Private loopback `leaseUri`, track ID, MIME, finite content length and original expiry |
| `release` | None | Revokes the current lease |
| `shutdown` | None | Revokes lease, closes backend and ends session |

Only one prepared lease is allowed. A second preparation returns `SOURCE_ACTIVE`
before contacting a provider; the parent must explicitly pause/release first.
No play, browser, shell, file import or arbitrary-target command exists. Resolver
restrictions remain enforced; errors never trigger provider/client rotation.
Lease URLs and tokens must stay within the JVM/native parent boundary, never
conversation history, renderer state, exports or provider diagnostics.

EOF, invalid handshake/sequence, malformed framing and broken output close owned
leases and the backend. EOF is processed between bounded catalog operations; it
does not replace an OS process supervisor or a native engine shutdown protocol.

Before this can satisfy the user's in-app player request, implement and verify:

- Integrate the standalone owned Rust supervisor and opaque native receipt into
  AnF using a reviewed bundled runtime/inventory. Preserve the public loader's
  prohibition on arbitrary localhost/file URLs. See [inventory gate](RUNTIME-INVENTORY.md).
- Paused native source loading, an acknowledged pause of Music/Studio/Spotube,
  playback state/error mapping, cancellation and parent/child shutdown.
- Actual AnF open/hide/search/queue/controls and capability discovery that becomes
  available only when the packaged host, native decoder and UI are functional.
- Live permitted music playback, corresponding source/dependency notices,
  native/UI/installed-upgrade acceptance and both Android identity/signer gates.

Generated-fixture transport and session tests demonstrate component behavior;
they do not establish provider streaming, Android playback or release readiness.
