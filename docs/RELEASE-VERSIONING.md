# Application version changes

Run from the repository root:

```powershell
node scripts/bump-version.mjs --dry-run 0.1.38
node scripts/bump-version.mjs 0.1.38
node scripts/check-version-bump.mjs
```

Choose the intended next version. The example is not an instruction to bump again after installing 0.1.37.

The tool validates all current application identities before writing. It changes only the Cargo workspace version, the anf/anf-hook lock entries, JavaScript root package versions and the Tauri application version. Dependencies may legitimately share the old app version, so never replace version strings globally. The regression check includes this collision plus retained checksums/URLs and disagreement rejection. An I/O error can still interrupt multi-file writes; inspect version coherence before continuing after a write failure.

The required source/release gate runs the check. Artifact generation, actual Android verification, native checks and verified publication are separate subsequent steps. This tool does not sign, tag, push or publish anything. Preserve the primary checkout's dirty/index state when using the task's temporary-index publication workflow.
