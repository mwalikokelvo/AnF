import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename, resolve } from "path";
import { proofreadGate, reportProofread } from "./proofread.ts";

interface SlideInfo {
  filename: string;
  path: string;
  index: number;
  promptPath?: string;
}

const SLIDE_PATTERN = /^(\d+)-slide-.*\.(png|jpg|jpeg)$/i;

// Slide-named images in formats the deck cannot embed. pdf-lib only accepts
// png/jpg — without this check such files were skipped SILENTLY and the deck
// shipped missing slides while the generator reported success.
const SUSPECT_SLIDE_RE = /^\d+-slide-.+\.(webp|gif|tiff|bmp|avif|heic|jfif)$/i;

/**
 * Dynamically load a third-party dependency, printing an actionable install
 * hint (instead of an opaque stack trace) if node_modules is missing.
 */
async function loadDep<T>(name: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (err?.code === "ERR_MODULE_NOT_FOUND" || /Cannot find (module|package)/i.test(msg)) {
      console.error(`\nError: missing Node dependency "${name}".`);
      console.error(`Install the script dependencies first:\n  cd ${import.meta.dir ?? new URL(".", import.meta.url).pathname} && npm install`);
      process.exit(1);
    }
    throw err;
  }
}

/** Detect image format from magic bytes rather than the (possibly wrong) extension. */
function detectImageFormat(buf: Buffer): "png" | "jpg" {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    console.error("Error: file contains webp bytes (RIFF/WEBP magic). pdf-lib cannot embed webp.");
    console.error("Convert it to png (generate-slides.py does this automatically) and re-run.");
    process.exit(1);
  }
  // Unknown signature — fall back to PNG (pdf-lib will surface a clear error).
  return "png";
}

function parseArgs(args: string[]): { dir: string; output?: string; allowUnproofread: boolean } {
  let dir = "";
  let output: string | undefined;
  let allowUnproofread = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" || args[i] === "-o") {
      output = args[++i];
    } else if (args[i] === "--allow-unproofread") {
      allowUnproofread = true;
    } else if (!args[i].startsWith("-")) {
      dir = args[i];
    }
  }

  if (!dir) {
    console.error("Usage: bun merge-to-pdf.ts <slide-deck-dir> [--output filename.pdf] [--allow-unproofread]");
    process.exit(1);
  }

  return { dir, output, allowUnproofread };
}

function findSlideImages(dir: string): SlideInfo[] {
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const promptsDir = join(dir, "prompts");
  const hasPrompts = existsSync(promptsDir);

  // Scan the deck root plus an optional slides/ subdirectory. Root wins on
  // duplicate filenames so both AI-generated and extracted slides are covered.
  const sources: Array<{ base: string; files: string[] }> = [
    { base: dir, files: readdirSync(dir) },
  ];
  const slidesSubdir = join(dir, "slides");
  if (existsSync(slidesSubdir)) {
    sources.push({ base: slidesSubdir, files: readdirSync(slidesSubdir) });
  }

  const seen = new Set<string>();
  const slides: SlideInfo[] = [];
  const suspects: string[] = [];

  for (const { base, files } of sources) {
    for (const f of files) {
      if (seen.has(f)) continue;
      if (SUSPECT_SLIDE_RE.test(f)) {
        suspects.push(f);
        seen.add(f);
        continue;
      }
      if (!SLIDE_PATTERN.test(f)) continue;
      seen.add(f);
      const match = f.match(SLIDE_PATTERN)!;
      const baseName = f.replace(/\.(png|jpg|jpeg)$/i, "");
      const promptPath = hasPrompts ? join(promptsDir, `${baseName}.md`) : undefined;
      slides.push({
        filename: f,
        path: join(base, f),
        index: parseInt(match[1], 10),
        promptPath: promptPath && existsSync(promptPath) ? promptPath : undefined,
      });
    }
  }

  if (suspects.length > 0) {
    console.error(`Found ${suspects.length} slide image(s) in a format the deck cannot embed:`);
    for (const f of suspects) {
      console.error(`  - ${f}`);
    }
    console.error("PDF only accepts .png/.jpg/.jpeg slides. Convert or re-generate them");
    console.error("(generate-slides.py converts webp responses to PNG automatically), then re-run.");
    console.error("Refusing to merge: these slides would otherwise be silently missing.");
    process.exit(1);
  }

  slides.sort((a, b) => a.index - b.index);

  if (slides.length === 0) {
    console.error(`No slide images found in: ${dir}`);
    console.error("Expected format: 01-slide-*.png, 02-slide-*.png, etc.");
    console.error("(Searched the deck root and an optional slides/ subdirectory.)");
    process.exit(1);
  }

  const { fatal, warnings } = validateSlideNumbers(slides);
  for (const w of warnings) {
    console.error(`Warning: ${w}`);
  }
  if (fatal.length > 0) {
    for (const f of fatal) {
      console.error(`Error: ${f}`);
    }
    console.error("Two slides share a number, so merge order is undefined. Fix the numbering and re-run.");
    process.exit(1);
  }

  return slides;
}

// Numbering sanity. Manual renumbering after add/delete (references/modification-guide.md)
// is the most error-prone step of the workflow, and sort() alone hides its mistakes:
// two slides sharing NN silently misorder the deck, and a gap breaks the NN<->position
// correspondence with no signal at all.
export function validateSlideNumbers(slides: SlideInfo[]): {
  fatal: string[];
  warnings: string[];
} {
  const fatal: string[] = [];
  const warnings: string[] = [];
  const byIndex = new Map<number, string[]>();
  for (const s of slides) {
    byIndex.set(s.index, [...(byIndex.get(s.index) || []), s.filename]);
  }
  for (const [index, files] of [...byIndex.entries()].sort((a, b) => a[0] - b[0])) {
    if (files.length > 1) {
      fatal.push(`duplicate slide number ${String(index).padStart(2, "0")}: ${files.join(", ")}`);
    }
  }
  const indices = [...byIndex.keys()].sort((a, b) => a - b);
  const lo = indices[0];
  const hi = indices[indices.length - 1];
  const missing: number[] = [];
  for (let n = lo; n <= hi; n++) {
    if (!byIndex.has(n)) missing.push(n);
  }
  if (missing.length > 0) {
    warnings.push(
      `slide number gap(s): ${missing.map((n) => String(n).padStart(2, "0")).join(", ")} ` +
        `missing between ${String(lo).padStart(2, "0")}..${String(hi).padStart(2, "0")} — ` +
        `renumber after deleting slides (references/modification-guide.md)`
    );
  }
  if (lo > 1) {
    warnings.push(`deck starts at ${String(lo).padStart(2, "0")}, not 01`);
  }
  return { fatal, warnings };
}

export async function createPdf(PDFDocument: any, slides: SlideInfo[], outputPath: string) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setAuthor("paper-slide-deck");
  pdfDoc.setSubject("Generated Slide Deck");

  for (const slide of slides) {
    const imageData = readFileSync(slide.path);
    const format = detectImageFormat(imageData);
    const image = format === "png"
      ? await pdfDoc.embedPng(imageData)
      : await pdfDoc.embedJpg(imageData);

    const { width, height } = image;
    const page = pdfDoc.addPage([width, height]);

    page.drawImage(image, {
      x: 0,
      y: 0,
      width,
      height,
    });

    console.log(`Added: ${slide.filename} [${format}]${slide.promptPath ? " (prompt available)" : ""}`);
  }

  const pdfBytes = await pdfDoc.save();
  // writeFileSync 而非 Bun.write：这是全 scripts 曾唯一的 bun 专属 API，
  // node 运行时会在全部图片 embed 完成后于最后一步崩溃、PDF 不产出
  writeFileSync(outputPath, pdfBytes);

  console.log(`\nCreated: ${outputPath}`);
  console.log(`Total pages: ${slides.length}`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { dir, output, allowUnproofread } = parseArgs(argv);
  const slides = findSlideImages(dir);
  // Step 6.5 gate: AI-generated slides must be proofread before they ship (scripts/proofread.ts).
  if (reportProofread(proofreadGate(dir, slides, { allowUnproofread }), allowUnproofread) !== 0) {
    return 1;
  }

  const { PDFDocument } = await loadDep("pdf-lib", () => import("pdf-lib"));

  // Resolve first: basename(".") is "." (yielding "..pdf"); resolve() gives the real dir name.
  const absDir = resolve(dir);
  const dirName = basename(absDir) === "slide-deck" ? basename(resolve(absDir, "..")) : basename(absDir);
  const outputPath = output || join(dir, `${dirName}.pdf`);

  console.log(`Found ${slides.length} slides in: ${dir}\n`);

  await createPdf(PDFDocument, slides, outputPath);
  return 0;
}

// Run only when executed directly (bun sets import.meta.main); tests import the
// module for validateSlideNumbers without triggering CLI side effects.
if ((import.meta as any).main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error("Error:", err.message);
      process.exit(1);
    }
  );
}
