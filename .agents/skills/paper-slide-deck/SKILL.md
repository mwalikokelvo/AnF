---
name: paper-slide-deck
description: Use when the user wants visually striking, shareable slide-deck IMAGES from any content — an article, blog post, topic, or paper — where look-and-feel matters more than editable precision (风格化幻灯/小红书配图/公众号配图/视觉化海报), optimized for reading and social sharing rather than live presentation. Offers 17 T2I aesthetic styles (watercolor, sketch-notes, pixel-art, editorial, chalkboard, etc.); each slide is an AI-generated image (Gemini/Nano Banana), so the look is distinctive but text/math/data are baked into the image (not editable). NOT for a faithful academic talk where equations, numbers, tables, and citations must stay exact, editable, and projector-ready (组会/答辩/thesis defense/conference/results-heavy talks) — for that use scholar-slides instead, since text-to-image will garble math and data.
---

# Paper Slide Deck Generator

Transform any content — an article, a topic, or a paper — into stylized, shareable slide images; for PDF papers, figures are detected and extracted from the source. Generated slides are AI images that garble math and numbers, so every slide recorded as generated (`generated.json`, written by `generate-slides.py` or `proofread.ts --record`) must carry a proofread disposition before the merge scripts accept the deck (Step 6.5).

## Usage

```bash
/paper-slide-deck path/to/paper.pdf
/paper-slide-deck path/to/paper.pdf --style academic-paper
/paper-slide-deck path/to/content.md --style sketch-notes
/paper-slide-deck path/to/content.md --audience executives
/paper-slide-deck path/to/content.md --lang zh
/paper-slide-deck path/to/content.md --slides 10
/paper-slide-deck path/to/content.md --outline-only
/paper-slide-deck  # Then paste content
```

## Setup (one-time)

The TypeScript scripts (`merge-to-*`, `detect-figures`, `extract-figure`,
`apply-template`) need Node dependencies. Install them once:

```bash
cd ${SKILL_DIR}/scripts && npm install
```

This installs `canvas`, `pdfjs-dist`, `pptxgenjs`, and `pdf-lib` (a `package-lock.json`
pins versions). If a script exits with `missing Node dependency "<name>"`, run the
command above. The Python generator (`generate-slides.py`) auto-installs `google-genai`
on first run.

**Also install PyMuPDF** (`pip install pymupdf`) — it is the reliable fallback for
extracting figures from pages that embed bitmaps (X-rays, CAM heatmaps, photographs),
where the `pdfjs` + `canvas` path in `extract-figure.ts` fails with
`Error: Image or Canvas expected`. For medical-imaging papers this is the common case,
not the exception, so treat PyMuPDF as required, not optional.

**Also install Pillow** (`pip install Pillow`) — when Gemini returns `image/webp`,
every slide goes through a Pillow conversion to PNG; without it each image errors with
"converting it needs Pillow (pip install Pillow)" until installed. Treat it as required
alongside PyMuPDF.

### Image generation & no-API-key path

Image generation needs either a `GOOGLE_API_KEY`/`GEMINI_API_KEY` (Gemini API) or the
Gemini Web skill. **If no key and no web option is available, the skill still works in
a degraded mode** — do not abort:

1. Run with `--outline-only` to produce the outline + prompts (no images).
2. For a source PDF, extract real figures/tables with `detect-figures.ts` +
   `extract-figure.ts` + `apply-template.ts` (no API key needed — pure rendering).
3. Merge whatever slides exist (`extract`-sourced pages) into PPTX/PDF, and hand the
   `prompts/` back to the user to generate images later when a key is available.

## Script Directory

**Important**: All scripts are located in the `scripts/` subdirectory of this skill.

**Agent Execution Instructions**:
1. Determine this SKILL.md file's directory path as `SKILL_DIR`
2. Script path = `${SKILL_DIR}/scripts/<script-name>.ts`
3. Replace all `${SKILL_DIR}` in this document with the actual path

**Script Reference**:
| Script | Purpose |
|--------|---------|
| `scripts/generate-slides.py` | Generate AI slides via Gemini API (Python) |
| `scripts/merge-to-pptx.ts` | Merge slides into PowerPoint |
| `scripts/merge-to-pdf.ts` | Merge slides into PDF |
| `scripts/detect-figures.ts` | Auto-detect figures/tables in PDF (heuristic; verify pages) |
| `scripts/extract-figure.ts` | Render a full PDF page to PNG (optional `--crop`; PyMuPDF fallback) |
| `scripts/apply-template.ts` | Apply figure container template |
| `scripts/proofread.ts` | Record a proofread disposition (`--mark`); the merge scripts' Step 6.5 gate |

## Options

| Option | Description |
|--------|-------------|
| `--style <name>` | Visual style — gallery + auto-selection rules in [references/style-selection.md](references/style-selection.md) |
| `--audience <type>` | Target audience: beginners, intermediate, experts, executives, general |
| `--lang <code>` | Output language (en, zh, ja, etc.) |
| `--slides <number>` | Target slide count |
| `--outline-only` | Generate outline only, skip image generation |

**Style & layout selection**: read [references/style-selection.md](references/style-selection.md)
when picking a style (explicit or auto-selected from content signals — including the
academic-signal caution about garbled math/numbers). Read
[references/layout-gallery.md](references/layout-gallery.md) only when composing the
outline's `// LAYOUT` hints (`Layout: <name>` per slide).

## Design Philosophy

This deck is designed for **reading and sharing**, not live presentation:
- Each slide must be **self-explanatory** without verbal commentary
- Structure content for **logical flow** when scrolling
- Include **all necessary context** within each slide
- Optimize for **social media sharing** and offline reading

## File Management

### Output Directory

Each session creates an independent directory named by content slug:

```
slide-deck/{topic-slug}/
├── source-{slug}.{ext}    # Source files (text, images; source-paper.pdf for papers)
├── figures.json           # Figure-detection results (academic PDFs)
├── outline.md             # Final outline (with IMAGE_SOURCE blocks)
├── outline-{style}.md     # Style variant outlines
├── extracted/             # Raw PDF page extractions (pre-template)
├── figures/               # Extracted figure crops (pre-template)
├── prompts/
│   └── {NN}-slide-{slug}.md, ...
├── {NN}-slide-{slug}.png  # Final slide images in the deck ROOT — both AI-generated
│                          #   and extracted-figure slides; ext may be .jpg
├── {topic-slug}.pptx
└── {topic-slug}.pdf
```

**Slug Generation**:
1. Extract main topic from content (2-4 words, kebab-case)
2. Example: "Introduction to Machine Learning" → `intro-machine-learning`

### Conflict Resolution

If `slide-deck/{topic-slug}/` already exists:
- Append timestamp: `{topic-slug}-YYYYMMDD-HHMMSS`
- Example: `intro-ml` exists → `intro-ml-20260118-143052`

### Source Files

Copy all sources with naming `source-{slug}.{ext}`:
- `source-article.md` (main text content)
- `source-diagram.png` (image from conversation)
- `source-data.xlsx` (additional file)

Multiple sources supported: text, images, files from conversation.

## Workflow

### Step 1: Analyze Content

1. Save source content (if pasted, save as `source.md`)
2. Follow `references/analysis-framework.md` for deep content analysis
3. Determine style (use `--style` or auto-select from signals)
4. Detect languages (source vs. user preference)
5. Plan slide count (`--slides` or dynamic)
6. **For academic papers (PDF with figures)**: Run automatic figure detection:
   ```bash
   npx -y bun ${SKILL_DIR}/scripts/detect-figures.ts --pdf source-paper.pdf --output figures.json
   ```
   This outputs a JSON file with all detected figures/tables, their page numbers, and captions.

   **Caption detection is heuristic — verify, especially the first-page teaser.** The
   line-anchored `Figure N` matcher reliably finds captions that sit on their own line
   (single-column layouts), but **misses figures whose caption is interleaved with body
   text on a two-column first page** — which is often the paper's most important
   architecture/overview figure. After running detect-figures, cross-check the source's
   `Figure 1` explicitly: if the paper's text references a `Figure N` that is absent from
   `figures.json`, add it manually via an `// IMAGE_SOURCE` block and extract it with the
   PyMuPDF fallback. Do not assume `figures.json` is complete.

### Step 2: Generate Outline Variants

1. If the user explicitly passed `--style <name>`, use that style directly and skip the
   variant question below (asking again after an explicit choice is noise). Otherwise,
   generate 3 style variant outlines based on content analysis
2. Follow `references/outline-template.md` for structure
3. **Auto-populate IMAGE_SOURCE** for academic papers:
   - Read `figures.json` from Step 1
   - Map figures to slides using rules in `references/analysis-framework.md` Section 8
   - Automatically add `// IMAGE_SOURCE` blocks to appropriate slides:
     - Architecture/pipeline figures → Methods slides (`Source: extract`)
     - Results tables → Quantitative results slides (`Source: extract`)
     - Comparison images → Qualitative results slides (`Source: extract`)
     - Conceptual/simple diagrams → Leave for AI generation (`Source: generate` or omit)
4. Save as `outline-{style}.md` for each variant

### Step 3: User Confirmation

**Single AskUserQuestion with all applicable options:**

| Question | When to Ask |
|----------|-------------|
| Style variant | Only when `--style` was NOT passed (3 options + custom); an explicit `--style` is the answer |
| Language | Only if source ≠ user language |

After selection:
- Copy selected `outline-{style}.md` to `outline.md`
- Regenerate in different language if requested
- User may edit `outline.md` for fine-tuning

If `--outline-only`, stop here.

### Step 4: Generate Prompts

1. Read `references/base-prompt.md`
2. Combine with style instructions from outline
3. Add slide-specific content
4. If `Layout:` specified in outline, include layout guidance in prompt:
   - Reference layout characteristics for image composition
   - Example: `Layout: hub-spoke` → "Central concept in middle with related items radiating outward"
5. Save to `prompts/` directory

### Step 5: Image Generation Method Selection

**Before generating images**, ask user to choose generation method:

**Use AskUserQuestion** with options:

| Option | Label | Description |
|--------|-------|-------------|
| 1 | **Gemini API (Recommended)** | Official Google API via Python. Requires GOOGLE_API_KEY env var. |
| 2 | **Gemini Web (Browser-based)** | ⚠️ Uses reverse-engineered web API. No API key needed but may break. |

If no API key is available, do **not** still recommend Option 1 — offer the degraded
no-key path from the Setup section (`--outline-only` + extraction + prompts handoff).

#### Option 1: Gemini API (Python)

1. **Verify API key**: Check `GOOGLE_API_KEY` or `GEMINI_API_KEY` environment variable
2. **Run generation script**:
   ```bash
   python3 ${SKILL_DIR}/scripts/generate-slides.py <slide-deck-dir>
   ```
   The model id is stated once here: `gemini-3-pro-image` (Nano Banana Pro, GA; the
   older `-preview` id is deprecated). Override with `--model <id>` only if needed.

**Script behavior** (details in the script docstring):
- Auto-installs `google-genai`; **errors out (non-zero) if no prompt files are found**
- Retries failed generations with backoff (3 attempts total, 10s/15s linear)
- Skips already-generated slides (> 10KB, any image extension)
- Writes each slide to the **deck root** — the same place extracted-figure slides
  land, so one merge step picks up both
- Saves with the **real** image extension, converting webp responses to PNG
  (the merge scripts only accept png/jpg/jpeg)

#### Option 2: Gemini Web Skill

The Web path does not write `generated.json` itself — record each slide it produces with
`proofread.ts --record <slide-deck-dir> <slide-file> --model gemini-web`, or the merge gate
cannot tell those slides are AI-generated (it warns when `prompts/` exists without a ledger).

Read [references/gemini-web.md](references/gemini-web.md) for the consent check,
per-slide invocation, and proxy setup. It requires the `baoyu-danger-gemini-web`
skill and explicit user consent to the reverse-engineered-API disclaimer.

### Step 5.5: Process IMAGE_SOURCE (Automatic Figure Extraction)

For academic presentations, IMAGE_SOURCE metadata was auto-populated in Step 2 based on figure detection from Step 1.

**Automatic Execution**:

1. **Parse outline** to identify slides with `Source: extract`
2. **Create figures directory**: `mkdir -p figures`
3. **For each extract slide**, automatically:
   - Read the Figure number, Page, and Caption from metadata
   - Run figure extraction script:
     ```bash
     npx -y bun ${SKILL_DIR}/scripts/extract-figure.ts \
       --pdf source-paper.pdf \
       --page <page-number> \
       --output figures/figure-<N>.png
     ```
     **Note**: `extract-figure.ts` renders the **entire page** to a high-resolution
     PNG — it does **not** auto-detect or crop a single figure's bounding box. On a
     two-column page you will get both columns. To isolate one figure, either pass
     `--crop "x,y,width,height"` (pixels in the rendered/scaled page) or open the
     PNG, confirm it visually, and crop manually before applying the template.
   - Run template application script:
     ```bash
     npx -y bun ${SKILL_DIR}/scripts/apply-template.ts \
       --figure figures/figure-<N>.png \
       --title "<slide-headline>" \
       --caption "Figure <N>: <caption-text>" \
       --output <NN>-slide-<slug>.png
     ```
   - Report: "Extracted: Figure N → slide NN"

4. **For slides with `Source: generate`** (or no IMAGE_SOURCE):
   - Proceed to Step 6 for AI generation

**Note**: Source PDF must be saved as `source-paper.pdf` in output directory.

**Troubleshooting**:
- If figure detection missed a figure: manually add `// IMAGE_SOURCE` block to outline
- If wrong figure mapped: edit the `Figure:` and `Page:` values in outline
- If extraction fails: check PDF page number (1-indexed)

**PyMuPDF Fallback for Page Extraction**:
If `extract-figure.ts` fails with "Image or Canvas expected" error (common with complex PDFs), use PyMuPDF:
```python
import fitz
doc = fitz.open("source-paper.pdf")
page = doc[page_num - 1]  # 0-indexed
mat = fitz.Matrix(3, 3)  # 3x scale for high resolution
pix = page.get_pixmap(matrix=mat)
pix.save(f"extracted/page-{page_num}.png")
```
Then apply template using `apply-template.ts`.

### Step 6: Generate Images

1. Use selected method from Step 5
2. **Skip slides already processed in Step 5.5** (those with `Source: extract`)
3. Generate session ID: `slides-{topic-slug}-{timestamp}`
4. Generate each remaining slide with same session ID
5. Report progress: "Generated X/N"
6. Failures retry automatically (API path: 3 attempts with backoff; see Step 5)

### Step 6.5: Proofread Generated Images (Content Integrity)

Text-to-image **bakes text into pixels and will garble spelling, math symbols, and
numbers** — this is the single biggest risk of this skill. Do not ship unchecked.
(This is this skill's instance of the repository's shared citation-integrity core
[`docs/citation-integrity-core.md`]: numbers and claims must match the source, and
failures surface as visible flags — never silent substitutes.)

**For every generated slide** (especially any with equations, tables, key numbers,
or non-Latin text), use `Read` to open the PNG and visually check:

1. **Spelling / wording** — headline and body text match the outline, no invented or
   mangled words.
2. **Math & symbols** — equations, subscripts, Greek letters, operators are correct
   (or absent). Assume the model got them wrong until you confirm otherwise.
3. **Numbers & units** — any figure that carries data matches the source exactly.

**Record every disposition** — `generate-slides.py` lists each slide it produced in
`generated.json` (with its sha256), and both merge scripts **refuse** a deck in which a
recorded slide has no disposition or was regenerated after its disposition:

```bash
npx -y bun ${SKILL_DIR}/scripts/proofread.ts --mark <slide-deck-dir> 04-slide-results.png ok
npx -y bun ${SKILL_DIR}/scripts/proofread.ts --mark <slide-deck-dir> 05-slide-eq.png check --note "σ garbled in eq. 2"
```

`ok` = checked, nothing wrong; `check` = still suspect after retries (listed as `[CHECK]` by the
merge and in the Step 8 summary). Extracted-figure slides are never in `generated.json` and are
not gated. `--allow-unproofread` on the merge scripts overrides the refusal with a warning —
only when the user explicitly accepts an unchecked deck.

**If garbling is found:**
- Regenerate that slide with a corrected/simplified prompt (spell risky terms
  phonetically, reduce text density, move exact numbers to a caption). **Max 2 retries.**
- If it still fails after 2 retries, **flag the slide `[CHECK]`** in the Step 8 summary
  and recommend one of:
  - Replace with an **extracted** figure/table from the source PDF (`Source: extract`), or
  - **Simplify** the slide to remove the fragile text, or
  - For a deck that genuinely needs faithful, editable formulas/data, switch to
    **scholar-slides**.

Never silently deliver a slide with garbled math or data — always surface it.

### Step 7: Merge to PPTX and PDF

```bash
npx -y bun ${SKILL_DIR}/scripts/merge-to-pptx.ts <slide-deck-dir>
npx -y bun ${SKILL_DIR}/scripts/merge-to-pdf.ts <slide-deck-dir>
```

Both exit 1 and name the slides when an AI-generated slide has no current proofread
disposition (Step 6.5); fix that rather than reaching for `--allow-unproofread`.

### Step 8: Output Summary

```
Slide Deck Complete!

Topic: [topic]
Style: [style name]
Location: [directory path]
Slides: N total

- 01-slide-cover.png ✓ Cover
- 02-slide-intro.png ✓ Content
- 04-slide-results.png ⚠ [CHECK] math/numbers — verify or use scholar-slides
- ...
- {NN}-slide-back-cover.png ✓ Back Cover

Outline: outline.md
PPTX: {topic-slug}.pptx
PDF: {topic-slug}.pdf
```

List any `[CHECK]`-flagged slides (from Step 6.5) explicitly so the user knows which
slides may contain garbled text/math/data and how to remediate them.

## Slide Modification

See `references/modification-guide.md` for:
- Edit single slide workflow
- Add new slide (with renumbering)
- Delete slide (with renumbering)
- File naming conventions

## Image Generation Dependencies

### Gemini API (Option 1 - Recommended)

Requires:
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` environment variable
- Python 3.8+ with pip
- `google-genai` package (auto-installed by script)

Model id: stated once in Step 5.

### Gemini Web Skill (Option 2)

See [references/gemini-web.md](references/gemini-web.md) — requires the
`baoyu-danger-gemini-web` skill, Chrome with a logged-in Google account, and user consent.

### PDF Figure Extraction

Requires (install via `cd ${SKILL_DIR}/scripts && npm install`):
- **Primary**: `pdfjs-dist` npm package (use legacy build for Node.js)
- `canvas` npm package for extract-figure.ts / apply-template.ts
- **Fallback**: `pymupdf` Python package (more reliable for complex PDFs)

## References

Read **only** the reference file for the stage you are in — never glob `references/`.

| File | Read when |
|------|-----------|
| `references/analysis-framework.md` | Step 1 — deep content analysis; IMAGE_SOURCE mapping rules |
| `references/style-selection.md` | Step 1/3 — style gallery + auto-selection (incl. academic-signal caution) |
| `references/outline-template.md` | Step 2 — outline structure and STYLE_INSTRUCTIONS format |
| `references/layout-gallery.md` | Step 2 — per-slide `Layout:` hints |
| `references/base-prompt.md` | Step 4 — base prompt for image generation |
| `references/gemini-web.md` | Step 5 Option 2 — consent, invocation, proxy |
| `references/modification-guide.md` | Post-delivery edits — add/delete/renumber slide workflows |
| `references/content-rules.md` | Content and style guidelines |
| `references/figure-container-template.md` | Step 5.5 — visual specs for extracted figure containers |
| `references/styles/<style>.md` | Full specification of the selected style |

## Notes

### Image Generation

- **Gemini API**: Recommended. Stable, reliable, requires API key
- **Gemini Web**: No API key needed, but uses reverse-engineered API with account risk
- Generation time: 10-30 seconds per slide
- Failures retry automatically (API path: 3 attempts with backoff)
- Maintain style consistency via session ID

### Content Guidelines

- Use stylized alternatives for sensitive public figures
- Both paths are Gemini image models, but the Web path's model version is not controlled by you — it follows Google's deployment and can drift from the API path
