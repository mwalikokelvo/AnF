# Unlimited-OCR Integration in AnF

AnF integrates **Unlimited-OCR** (Baidu's one-shot long-horizon vision-language document parser) for private, on-device document extraction and conversion.

---

## 1. Supported Features

| Workspace Touchpoint | Capability |
| :--- | :--- |
| **Deep Reader (`reader.ts`)** | 1-click **Scan/OCR** button in the header. Converts multi-page scanned PDFs and image documents into structured chapters with automatic Table of Contents (`toc`), tables, and LaTeX math formatting. |
| **Writing Desk (`writing.ts`)** | **Scan/OCR** toolbar button. Lets users upload image or PDF scans, extracting clean Markdown text, tables, and mathematical formulas directly into their draft. |
| **OCR Client (`ocr-client.ts`)** | Robust client library connecting to local vision endpoints (`http://localhost:8000/v1` or vLLM/SGLang). Handles base64 image encoding, heading extraction, table counting, and LaTeX formula detection. |

---

## 2. Technical Architecture

- **Endpoint**: Configurable via `DEFAULT_OCR_ENDPOINT` (default: `http://localhost:8000/v1`).
- **Prompt**: Enforces Markdown preservation with LaTeX math (`$...$` and `$$...$$`) and Markdown tables (`| ... |`).
- **Tauri CSP**: Configured in `tauri.conf.json` with permissions for `localhost:8000` and `127.0.0.1:8000`.
- **Offline Fallback**: Displays clear user guidance when the local OCR service is offline without blocking or crashing the application.

---

## 3. Verification

Unit tests in `windows/tests/ocr-client.test.ts` verify:
- Heading extraction across H1–H6 levels.
- Markdown table count and LaTeX formula detection.
- Graceful offline error handling.
