# AnF 0.1.34 preview

Windows offline model processes now start suspended, enter a private kill-on-close Windows Job, and resume only after ownership succeeds. Both normal closure and forced owner termination end the owned process tree. The gateway retains its restricted environment; the local model retains its inherited environment. Unicode paths, spaces, quoted/empty arguments and trailing slashes are handled by the Windows command-line encoder, with NUL and oversized commands rejected.

Repeated OmniRoute imports fail before rescanning the component source. The existing optional 3.8.51 Windows component remains compatible and does not need to be downloaded or imported again for this update.

## Verification

- Native tests: 93 passed, 0 failed, 15 helper/manual tests ignored.
- A fresh offline answer was generated from an isolated installation containing spaces and Unicode. Its model was confirmed running immediately before forcibly ending the QA app; cleanup completed in 1,854 ms.
- Managed gateway native acceptance passed all eight lifecycle/authentication/generation/cancellation/restart/exit checks. Startup measured 127,249 ms on this PC.
- QA identifies the actual executable by parent PID and canonical file identity, accounting for Windows namespace prefixes and UTF-8 CIM output. It waits for a new empty conversation before generating a unique prompt.
- Windows production packaging passed complete verification of 593 portable files, ZIP CRCs and hashes. Setup: 1,816,638,955 bytes; portable ZIP: 1,820,530,657 bytes.
- Android was rebuilt at version 0.1.34 and passed current artifact, manifest, bundled asset/native-library, alignment and development-signature gates. The model process ownership fix is Windows-specific; Android device testing remains outstanding.

## Limits and remaining work

Windows remains unsigned; Android uses a development signing key. No production signing, Android device playback, Linux build or Strix scan is claimed. This acceptance covers the local model and managed gateway, not every external media or speech subprocess. Private recordings and private voice models are excluded from published packages. The user's installed application was not replaced or terminated during QA.

See REMAINING-IMPLEMENTATION-PLAN.md for the remaining reader, music-provider, mobile, service, plugin and release work. Home gateway discoverability and managed runtime upgrade/recovery remain next gateway milestones.
