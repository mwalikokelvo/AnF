# Local A&F continuation checkpoint

Latest source: shared-domain migration, 24 October 2026. Read AF-Shared-Domain-Checkpoint-2026-10-24.md and AF-GitHub-Continuation-2026-10-24.md. The tested local source is preserved separately from the divergent app at repository root; it does not replace or merge main.

`af/work/coucou` contains Windows, Android and shared domain/audio sources. `spotube/spotube-master` preserves the source used by the local music module. Root helpers originally ran from a build-work directory; restore that layout and provision the documented tools/dependencies/signing before builds. `verification` holds local evidence, not cloud CI/device acceptance. Source hashes and excluded binaries are listed in checkpoint-manifest.json. Installers/APKs, model/runtime binaries and signing keys are not stored in ordinary Git; exact delivered artifact hashes are in the checkpoint document.

Chat plugin source: repository-root plugins/anf-tauri-toolkit. Next reconcile local protections with main's native music/design/CI before merging.
