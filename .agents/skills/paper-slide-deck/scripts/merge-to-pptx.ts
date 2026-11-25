import { existsSync, readdirSync, readFileSync } from "fs";
import { join, basename, resolve } from "path";
import { proofreadGate, reportProofread } from "./proofread.ts";

interface SlideInfo {
  filename: string;
  path: string;
  index: number;
  promptPath?: string;
}

const SLIDE_PATTERN = /^(\d+)-slide-.*\.(png|jpg|jpeg)$/i;

// Slide-named images in formats the deck cannot embed. pptxgenjs only accepts
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
      console.error(`Install the script dependencies first:\n  cd ${import.meta.dir} && npm install`);
      process.exit(1);
    }
    throw err;
  }
}

/** Detect image MIME type from magic bytes rather than the (possibly wrong) extension. */
function detectMimeType(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    console.error("Error: file contains webp bytes (RIFF/WEBP magic). PowerPoint cannot embed webp.");
    console.error("Convert it to png (generate-slides.py does this automatically) and re-run.");
    process.exit(1);
  }
  return "image/png";
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
    console.error("Usage: bun merge-to-pptx.ts <slide-deck-dir> [--output filename.pptx] [--allow-unproofread]");
    process.exit(1);
  }

  return { dir, output, allowUnproofread };
}

export function findSlideImages(dir: string): SlideInfo[] {
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
      // 生成器明确接受 *.md 与 *.txt 两种 prompt（list_prompt_files 先 txt 后
      // md）——配对也必须两者都认，否则 .txt 的讲稿被静默丢出备注
      const promptPath = hasPrompts
        ? [`${baseName}.md`, `${baseName}.txt`]
            .map((n) => join(promptsDir, n))
            .find((p) => existsSync(p))
        : undefined;
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
    console.error("PPTX only accepts .png/.jpg/.jpeg slides. Convert or re-generate them");
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
        `renumber after deleting slides (references/modification-guide.md), ` +
        `or a slide failed to generate (re-run generate-slides.py)`
    );
  }
  if (lo > 1) {
    warnings.push(`deck starts at ${String(lo).padStart(2, "0")}, not 01`);
  }
  return { fatal, warnings };
}

function findBasePrompt(): string | undefined {
  // import.meta.dir is bun-only; fall back to the URL so plain node works too.
  const scriptDir = import.meta.dir ?? new URL(".", import.meta.url).pathname;
  const basePromptPath = join(scriptDir, "..", "references", "base-prompt.md");
  if (existsSync(basePromptPath)) {
    return readFileSync(basePromptPath, "utf-8");
  }
  return undefined;
}

async function createPptx(PptxGenJS: any, slides: SlideInfo[], outputPath: string) {
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_16x9";
  pptx.author = "paper-slide-deck";
  pptx.subject = "Generated Slide Deck";

  const basePrompt = findBasePrompt();
  let notesCount = 0;

  for (const slide of slides) {
    const s = pptx.addSlide();
    const imageData = readFileSync(slide.path);
    const base64 = imageData.toString("base64");
    const mimeType = detectMimeType(imageData);

    s.addImage({
      data: `data:${mimeType};base64,${base64}`,
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
      sizing: { type: "cover", w: "100%", h: "100%" },
    });

    if (slide.promptPath) {
      const slidePrompt = readFileSync(slide.promptPath, "utf-8");
      const fullNotes = basePrompt ? `${basePrompt}\n\n---\n\n${slidePrompt}` : slidePrompt;
      s.addNotes(fullNotes);
      notesCount++;
    }

    console.log(`Added: ${slide.filename}${slide.promptPath ? " (with notes)" : ""}`);
  }

  await pptx.writeFile({ fileName: outputPath });
  console.log(`\nCreated: ${outputPath}`);
  console.log(`Total slides: ${slides.length}`);
  if (notesCount > 0) {
    console.log(`Slides with notes: ${notesCount}${basePrompt ? " (includes base prompt)" : ""}`);
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { dir, output, allowUnproofread } = parseArgs(argv);
  const slides = findSlideImages(dir);
  // Step 6.5 gate: AI-generated slides must be proofread before they ship (scripts/proofread.ts).
  if (reportProofread(proofreadGate(dir, slides, { allowUnproofread }), allowUnproofread) !== 0) {
    return 1;
  }

  const PptxGenJS = (await loadDep("pptxgenjs", () => import("pptxgenjs"))).default;

  // Resolve first: basename(".") is "." (yielding "..pptx"); resolve() gives the real dir name.
  const absDir = resolve(dir);
  const dirName = basename(absDir) === "slide-deck" ? basename(resolve(absDir, "..")) : basename(absDir);
  const outputPath = output || join(dir, `${dirName}.pptx`);

  console.log(`Found ${slides.length} slides in: ${dir}\n`);

  await createPptx(PptxGenJS, slides, outputPath);
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
