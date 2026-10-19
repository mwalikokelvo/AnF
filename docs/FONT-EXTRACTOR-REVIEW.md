# Pinned font extractor implementation review

Reviewed https://github.com/lucaschultz/adobe-font-extractor at d449020e2814bf714112883d0261e9a5fcc7a613 (MIT, Copyright 2025 Luca Schultz), including src/commands/extract-command.ts, src/shared/get-source.ts, src/shared/get-font-infos.ts and src/shared/copy-file.ts. Upstream locates Adobe CoreSync/plugins/livetype, recursively discovers OTF/TTF files, reads fontkit PostScript names and copies files to user destinations. It performs no font download. Force/dry-run/error handling belong to its CLI; its MIT code license does not grant rights to fonts.

AnF independently implements the local-cache-copy approach in scripts/extract-licensed-fonts.mjs. No upstream code is copied. Explicit licensed source/destination, byte signatures, 10 MB/file, 200-font/50,000-entry/depth-12 limits, symlink rejection and SHA-256 output filenames bound this operation. Hash names avoid untrusted font metadata paths. All copies use exclusive creation; the manifest refuses overwriting. Import resulting files through Settings / Reading fonts. No Adobe font binaries are bundled or redistributed.

Lora and Atkinson Hyperlegible are actual bundled OFL fonts; source bytes/revisions and licenses are recorded in windows/src/workspace/assets/provenance.json and visible in app settings.
