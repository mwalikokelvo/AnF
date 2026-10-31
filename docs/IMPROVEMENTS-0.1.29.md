# AnF 0.1.29 — original PDF pages and a usable reading notebook

## Reading improvements

- Windows reader can switch between selectable Reading text and the original PDF page, including page layout, figures and footnotes. The original is rendered locally with the existing Windows PDF API; no upload, account, API key or PDF.js download is required. Fit width, 125%, 150% and 200% zoom are available.
- Original pages require the retained local file from import. Text-only backups/device sync and server-imported text do not contain the original PDF; reimport the PDF on this computer to view it. Other document formats retain the text reader. Image pages have descriptive labels but no selectable PDF text layer; selecting, searching, highlighting and listening use Reading text.
- Search is literal and case-insensitive by default, with optional Match case, visible counts, next/previous navigation and Ctrl/Cmd+F. Results are capped at 5,000 and labeled when truncated. Original-page search switches to Reading text to show the located words.
- Highlights are visible across the document, with an optional current-page filter and jump-to-excerpt buttons. Export reading notes creates a Markdown file with source name, page/section labels, quoted excerpts, notes and bookmarks. Export follows the active filter; large collections can be exported page by page within the existing 200 KB document-export limit.
- Search and appearance are collapsed into a compact toolbar. Notes disclose their expanded state for assistive technology. Short windows remain scrollable.
- Resume at the exact end of a source stays on its last page. The reading percentage now reflects the saved position rather than the end of the displayed page.

## Safety and performance

The page command is restricted to the workspace window and loads the selected source from its saved project. It accepts no caller file path. Canonical paths must remain under AnF’s retained-source folder, in a generated 64-character source directory, and must be PDFs under 50 MB. Page numbers are bounded to the saved source and 600-page limit. Rendered images fit within 1,600 × 2,400 pixels and 8 MB; a single native renderer permit bounds concurrent work. The reader coalesces rapid navigation, discards stale responses on close or source changes, and caches at most two images within 12 MB. Existing production identifiers, original files and reading-note anchors are preserved.

The existing OCR render dimensions are preserved separately from preview sizing. The optional real scanned-PDF OCR check currently fails on a fixture spelling ("seven etters" instead of "seven letters"); it is recorded rather than weakening the test. This release does not claim to correct OCR spelling or reading order. Source text and existing annotations are not rewritten.

The implementation reuses [Windows PDF rendering options](https://learn.microsoft.com/en-us/uwp/api/windows.data.pdf.pdfpagerenderoptions) and the bundled renderer/OCR infrastructure. It adds no external service or model dependency.

## Verification

Native unit/security checks, real Windows original-page rendering and dimension checks, invalid page and non-workspace denial, a forged outside-retained-tree source rejection, and original/text switching. Browser checks cover literal Unicode search and case matching, preserved annotation offsets, all-page note navigation and filtered export, compact controls, short-window access, stale render responses and existing local tools/music choices. Final package and appearance results are recorded in local build status once complete.

Strix remains a separate pending gate; a missing CLI/Docker preflight is not a security scan. Android shared reader assets are checked independently; this iteration delivers a Windows build, not a new Android APK.

Completed verification: 68 native tests pass (12 optional ignored); TypeScript, release/data/workflow/skill checks, dedicated reader/browser flows, refreshed Android assets and all 84 appearance views pass. The separately executed optional real-OCR check fails as documented above. Final installer and portable ZIP contain the correct production executable and all 593 runtime files, with matching native SDK files, current UI assets, ZIP CRCs and SHA-256. Native preview: `releases/anf-0.1.29/previews/windows-original-pdf.png`.

Artifacts: `windows/release/AnF-Windows-0.1.29-setup.exe` and `windows/release/AnF-Windows-0.1.29-portable.zip`. Quit the tray app before installing. No production app identifier or data path changes; builds remain local and unpublished.
