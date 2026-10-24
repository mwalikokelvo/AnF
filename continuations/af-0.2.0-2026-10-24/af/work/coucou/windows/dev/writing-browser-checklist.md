# Live writing browser verification

Run the existing Vite development server bound to `127.0.0.1`, then open `/dev/writing-preview.html` in a browser. The fixture imports the real writing editor and lazy live EditorView. It uses synthetic in-memory text and has no native IPC or saved project access.

1. Replace live text with `Browser-verified writing`. Observed writing should show that text and one change.
2. Lock writing. Click Bold and toolbar Undo. Text/change count must stay unchanged and a temporary-lock message must appear.
3. Select Markdown source. Its textarea must be read-only.
4. Load host document while locked, then return to Live Markdown. It should show `Host-loaded fixture` and remain non-editable.
5. Unlock, type replacement text, then press the platform Undo shortcut. The host-loaded text should return.

Also test IME composition, locked keyboard shortcuts, selection and completion popups manually on target native devices. Those scenarios were not established by the initial in-app browser run. Close the tab and stop the temporary development server after verification.
