// Proofread gate for AI-generated slides (SKILL.md Step 6.5).
//
// Text-to-image bakes text into pixels and garbles math, numbers and spelling. Step 6.5 asks the
// agent to open every generated slide and check it; this module makes skipping that visible:
//
//   generated.json  — written by generate-slides.py: every slide it produced, with its sha256
//   proofread.json  — written by `proofread.ts --mark`: a disposition per slide, bound to the
//                     sha256 of the bytes that were actually looked at
//
// merge-to-pptx / merge-to-pdf refuse a deck in which a recorded slide has no disposition, or
// whose bytes changed after it was proofread (a regenerated slide is a new image). `check`
// dispositions are allowed but listed — they are the [CHECK] slides of the Step 8 summary.
// Slides are identified by their bytes (sha256), so renumbering or re-slugging a slide keeps it
// gated. A deck without generated.json is not gated, but a deck with prompts/ and no ledger is
// warned about (Gemini Web path, or a generator older than this gate).
//
//   bun proofread.ts --mark <deck-dir> <NN-slide-x.png> ok|check [--note "garbled σ in eq. 2"]
//   bun proofread.ts --record <deck-dir> <NN-slide-x.png> [--model gemini-web]   (Gemini Web path)

import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";

export const GENERATED = "generated.json";
export const PROOFREAD = "proofread.json";
const STATUSES = new Set(["ok", "check"]);

interface Entry { sha256?: string; status?: string; note?: string }

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readSlides(path: string): Record<string, Entry> {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf-8"));
  return (parsed && typeof parsed.slides === "object" && parsed.slides) || {};
}

export function proofreadGate(
  dir: string,
  slides: Array<{ filename: string; path: string }>,
  { allowUnproofread = false }: { allowUnproofread?: boolean } = {}
): { fatal: string[]; warnings: string[]; checks: string[] } {
  const fatal: string[] = [];
  const warnings: string[] = [];
  const checks: string[] = [];
  const generatedPath = join(dir, GENERATED);
  if (!existsSync(generatedPath)) {
    // Without the ledger the gate cannot tell generated from extracted slides. Say so: a deck
    // made by the Gemini Web path, or by a generator older than this gate, lands here.
    if (existsSync(join(dir, "prompts"))) {
      warnings.push(`no ${GENERATED}: the proofread gate cannot tell which slides are AI-generated — ` +
        `record them with \`proofread.ts --record <deck-dir> <slide-file>\` (Gemini Web path) and proofread them`);
    }
    return { fatal, warnings, checks };
  }
  let generated: Record<string, Entry>;
  let proofread: Record<string, Entry>;
  try {
    generated = readSlides(generatedPath);
    proofread = readSlides(join(dir, PROOFREAD));
  } catch (err: any) {
    // An unreadable ledger must not read as "nothing to proofread".
    fatal.push(`cannot read ${GENERATED}/${PROOFREAD}: ${err?.message ?? err}`);
    return { fatal, warnings, checks };
  }
  // Identity is the image bytes, not the filename: the modification guide renumbers and
  // re-slugs slides, and a renamed generated slide must stay generated.
  const generatedHashes = new Set(Object.values(generated).map((e) => e.sha256).filter(Boolean));
  const proofreadByHash = new Map<string, Entry>();
  for (const e of Object.values(proofread)) if (e.sha256) proofreadByHash.set(e.sha256, e);
  const seenHashes = new Set<string>();
  const unproofread: string[] = [];
  for (const slide of slides) {
    const hash = sha256File(slide.path);
    seenHashes.add(hash);
    if (!(slide.filename in generated) && !generatedHashes.has(hash)) continue; // extracted / hand-made
    const entry = proofreadByHash.get(hash);
    if (entry && STATUSES.has(entry.status ?? "")) {
      if (entry.status === "check") checks.push(`${slide.filename}${entry.note ? ` — ${entry.note}` : ""}`);
    } else if (slide.filename in proofread) {
      unproofread.push(`${slide.filename} (changed since it was proofread — re-check the new image)`);
    } else {
      unproofread.push(`${slide.filename} (no proofread disposition)`);
    }
  }
  const missing = Object.entries(generated)
    .filter(([name, e]) => !seenHashes.has(e.sha256 ?? "") && !slides.some((s) => s.filename === name))
    .map(([name]) => name);
  if (missing.length) {
    warnings.push(`recorded generated slide(s) not in the deck: ${missing.join(", ")} — deleted, or edited after generation ` +
      `(an edited image is no longer recognisable; re-record it with --record and proofread it)`);
  }
  if (unproofread.length) {
    const msg = `${unproofread.length} AI-generated slide(s) not proofread (SKILL.md Step 6.5): ${unproofread.join("; ")}`;
    (allowUnproofread ? warnings : fatal).push(msg);
  }
  return { fatal, warnings, checks };
}

/** Print the gate result; return the exit code the merge should use (0 or 1). */
export function reportProofread(result: ReturnType<typeof proofreadGate>, allowUnproofread: boolean): number {
  for (const c of result.checks) console.error(`[CHECK] ${c}`);
  for (const w of result.warnings) console.error(`Warning: ${w} — merging anyway (--allow-unproofread)`);
  for (const f of result.fatal) console.error(`Error: ${f}`);
  if (result.fatal.length) {
    console.error(
      "Open each listed slide, check spelling / math / numbers, then record it:\n" +
        "  bun proofread.ts --mark <deck-dir> <slide-file> ok|check [--note \"…\"]\n" +
        (allowUnproofread ? "" : "Or pass --allow-unproofread to merge anyway (the deck then ships unchecked).")
    );
    return 1;
  }
  return 0;
}

// The merge scripts read slides from the deck root and an optional slides/ subdirectory.
function locateSlide(dir: string, filename: string): string {
  for (const candidate of [join(dir, filename), join(dir, "slides", filename)]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`slide not found in ${dir} or ${join(dir, "slides")}: ${filename}`);
}

function writeLedger(path: string, slides: Record<string, Entry>): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ slides }, null, 2) + "\n");
  renameSync(tmp, path);
}

export function markProofread(dir: string, filename: string, status: string, note?: string): void {
  if (!STATUSES.has(status)) throw new Error(`status must be ok or check, got "${status}"`);
  const slidePath = locateSlide(dir, filename);
  const path = join(dir, PROOFREAD);
  const slides = readSlides(path);
  slides[filename] = { sha256: sha256File(slidePath), status, ...(note ? { note } : {}) };
  writeLedger(path, slides);
}

/** Record a slide as AI-generated when generate-slides.py did not (Gemini Web path, older runs). */
export function recordGenerated(dir: string, filename: string, model = "manual"): void {
  const slidePath = locateSlide(dir, filename);
  const path = join(dir, GENERATED);
  const slides = readSlides(path);
  slides[filename] = { sha256: sha256File(slidePath), model } as Entry;
  writeLedger(path, slides);
}

const USAGE =
  'Usage: bun proofread.ts --mark <deck-dir> <slide-file> ok|check [--note "…"]\n' +
  "       bun proofread.ts --record <deck-dir> <slide-file> [--model gemini-web]";

if ((import.meta as any).main) {
  const args = process.argv.slice(2);
  const option = (flag: string) => (args.indexOf(flag) >= 0 ? args[args.indexOf(flag) + 1] : undefined);
  const skip = new Set(["--note", "--model"].flatMap((f) => (args.indexOf(f) >= 0 ? [args.indexOf(f), args.indexOf(f) + 1] : [])));
  const positional = args.filter((a, i) => i > 0 && !skip.has(i));
  try {
    if (args[0] === "--mark" && positional.length === 3) {
      markProofread(positional[0], positional[1], positional[2], option("--note"));
      console.log(`Recorded: ${positional[1]} → ${positional[2]}`);
    } else if (args[0] === "--record" && positional.length === 2) {
      recordGenerated(positional[0], positional[1], option("--model") ?? "manual");
      console.log(`Recorded as AI-generated: ${positional[1]} (proofread it before merging)`);
    } else {
      console.error(USAGE);
      process.exit(2);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}
