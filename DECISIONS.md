# Autonomous Decision Log

| Timestamp | Scope | Decision Made | Rationale and Alternatives Considered |
| --- | --- | --- | --- |
| 2026-10-17 | Baseline | Preserve the active release checkout and snapshot current source into an isolated sprint ref | The attached document assumes main, but this checkout has substantial newer uncommitted release work. Switching to stale main would lose the implemented baseline. No push or main merge. |
| 2026-10-17 | Governance | Strengthen starter-kit examples with bounded paths, no forced worktree deletion, and fail-closed checks | The sample scripts contain force-delete fallbacks and ignored test failures; copying those verbatim would undermine the requested verification gates. |
| 2026-10-17 | Android identity | Use a new AnF identity with explicit export/import migration | User selected this in pre-flight. A new application ID cannot directly read the old app's private sandbox; do not imply an in-place upgrade or uninstall the old app. |
| 2026-10-17 | Voices | Use both recordings with user permission, local synthesis only | User confirmed rights and local-only processing. Samples and trained/reference-backed synthesis are separate readiness states; do not fabricate voice availability. |
| 2026-10-17 | Fonts | Bundle openly licensed defaults; support licensed user imports/cache extraction | User selected this. The extractor copies existing local fonts; its MIT code license does not grant font redistribution rights. |
| 2026-10-17 | Ownership | Core renaming precedes integration of feature branches; specialists report exact touched files and evidence | Broad token/path changes overlap reader and Android work. Integrate with explicit reconciliation and regenerate compiled artifacts only after source stabilizes. |

| 2026-10-18 | Recovery | Resume preserved specialist branches after agent credit errors | Frontend commit and mobile/asset partial work survived. Do not restart or discard their implementations. |
| 2026-10-18 | Worktree safety | Canonicalize Windows paths with native realpath before repository ownership comparison | Generic realpath retained 8.3 aliases and falsely rejected clean removal. Isolated tests verify refusal for dirty/foreign paths and normal removal. |

## 2026-10-19 OmniRoute-first release decisions

- Preserve31 as delivered baseline while32 is under development. No release claim
  for source-only gateway, OCR or build-tool changes. Gate32Windows/Android artifacts
  after integration and native checks; preserve old artifacts.
- OmniRoute remains explicit optional routing. Add guided pinned local setup and
  bounded model discovery; differentiate reachable catalog from successful inference.
  Verify real locally routed generation using a separate DATA_DIR/port and bundled
  model. Cloud provider accounts/quotas are not granted by installing a gateway.
- Preserve first user message when gateway request lacks a leading system message.
  Use bounded response budgets and cancellable requests; no silent fallback.
- OCR root cause measured: resampling1600x2240 to1714x2400 loses a glyph. Preserve
  native grid for smaller images while bounding oversized inputs. Keep original
  phrase assertion and scanned PDF unchanged; no text-specific substitutions.
- Test installers in isolated registry namespaces; even /S /D still changes HKCU
  app registration. Existing installed-app registry/data remains untouched.
