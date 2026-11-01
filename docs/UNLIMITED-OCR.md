# Unlimited-OCR Integration in AnF

AnF integrates **Unlimited-OCR** (Baidu's one-shot long-horizon vision-language document parser) for private, on-device document extraction and conversion.

---

## 1. Supported Features

| Workspace Touchpoint | Capability |
| :--- | :--- |
| **Deep Reader (`reader.ts`)** | 1-click **Scan/OCR** button in the header. Converts multi-page scanned PDFs and image documents into structured chapters with automatic Table of Contents (`toc`), tables, and LaTeX math formatting. |
| **Writing Desk (`writing.ts`)** | **Scan/OCR** toolbar button. Lets users upload image or PDF scans, extracting clean Markdown text, tables, and mathematical formulas directly into their draft. |
| **OCR Client (`ocr-client.ts`)** | Client library that talks to the local vision server only through the Rust commands `ocr_status` / `ocr_request` (it never opens a network connection itself). Handles base64 image encoding, heading extraction, table counting, and LaTeX formula detection. |

---

## 2. Technical Architecture

- **Endpoint**: Rust starts `<local_dir>/ocr/unlimited-ocr` on an OS-chosen ephemeral `127.0.0.1` port and keeps it private; the UI only displays it. A readiness check requires the spawned child to be alive and answer `/v1/models`, so a process that grabs the port first (the child then fails to bind and exits) is not treated as ready. Residual risk: a tiny window between choosing and binding the port.
- **External server**: optional, `http://127.0.0.1:<port>/v1` only (port >= 1024). It is configured with `ocr_configure_external` and used only after the user confirms that exact endpoint (the status badge shows an "Allow OCR server at ..." button and always shows the endpoint in use). Changing the endpoint resets the confirmation. There is no settings-screen field to type the endpoint yet.
- **Prompt**: Enforces Markdown preservation with LaTeX math (`$...$` and `$$...$$`) and Markdown tables (`| ... |`).
- **Tauri CSP**: no loopback `connect-src` at all. Because the port is dynamic, a CSP port range would let the webview reach any local service; instead `ocr_request` forwards only `GET models` and `POST chat/completions` from Rust to the owned (or confirmed external) loopback server, without system proxy or redirects.
- **Offline Fallback**: Displays clear user guidance when the local OCR service is offline without blocking or crashing the application.

---

## 3. Verification

Unit tests in `windows/tests/ocr-client.test.ts` verify:
- Heading extraction across H1–H6 levels.
- Markdown table count and LaTeX formula detection.
- Graceful offline error handling.
