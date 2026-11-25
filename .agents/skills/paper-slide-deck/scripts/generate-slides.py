"""
generate-slides.py - Generate slide images using Gemini API

Usage:
    python3 generate-slides.py <slide-deck-dir> [--model MODEL]

Arguments:
    slide-deck-dir    Directory containing a prompts/ folder with slide prompts
                      (prompt files may be *.md or *.txt)

Options:
    --model MODEL     Gemini model to use (default: gemini-3-pro-image).
                      Note: the older "gemini-3-pro-image-preview" id is
                      deprecated now that Nano Banana Pro is GA — use the
                      stable "gemini-3-pro-image" id instead.

Environment:
    GOOGLE_API_KEY or GEMINI_API_KEY must be set

Behaviour:
    - Generated images are written to the deck ROOT directory (next to the
      prompts/ folder), matching the SKILL.md file tree and the location where
      extracted-figure slides are written, so a single merge step picks up both.
    - Output extension follows the real image format returned by the model
      (Gemini often returns image/jpeg even when PNG is requested), so JPEG
      bytes are saved as .jpg — never mislabelled as .png.
    - webp responses are converted to PNG before saving: PowerPoint and the
      merge scripts (merge-to-pptx.ts / merge-to-pdf.ts) only accept png/jpg,
      so a .webp on disk would be silently dropped from the final deck.
    - Idempotent: already-generated slides (any image ext, > 10 KB) are skipped.

Example:
    python3 generate-slides.py ./slide-deck/my-presentation --model gemini-3-pro-image
"""

import hashlib
import json
import os
import re
import sys
import time
import argparse
import io
from pathlib import Path

DEFAULT_MODEL = "gemini-3-pro-image"

# Image extensions we consider a "generated slide"
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")

# Map response MIME type -> file extension
MIME_TO_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
}

# Slide image files look like: 01-slide-cover.png, 02-slide-intro.jpg, ...
SLIDE_IMAGE_RE = re.compile(r"^\d+-slide-.*\.(png|jpg|jpeg|webp)$", re.IGNORECASE)


def check_dependencies():
    """Check and install required dependencies."""
    try:
        from google import genai
        from google.genai import types
        return genai, types
    except ImportError:
        print("Installing google-genai package...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "google-genai", "-q"])
        from google import genai
        from google.genai import types
        return genai, types


def ext_for_mime(mime_type: str) -> str:
    """Return the correct file extension for a response MIME type."""
    if not mime_type:
        return ".png"
    return MIME_TO_EXT.get(mime_type.strip().lower(), ".png")


def convert_webp_to_png(image_data: bytes) -> bytes:
    """Re-encode webp bytes as PNG.

    PowerPoint and the merge scripts only accept png/jpg; a .webp slide on
    disk is silently dropped from the final PPTX/PDF. Raises RuntimeError if
    Pillow is unavailable or cannot decode the bytes.
    """
    try:
        from PIL import Image
    except ImportError as error:
        raise RuntimeError(
            "Gemini returned image/webp; converting it needs Pillow "
            "(pip install Pillow)"
        ) from error
    with Image.open(io.BytesIO(image_data)) as image:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()


def finalize_image_data(image_data: bytes, mime_type: str) -> tuple[bytes, str]:
    """Return (bytes, ext) to write for a response payload, converting webp.

    Keeps the on-disk contract with the merge scripts: only .png / .jpg / .jpeg
    slides exist after a successful run.
    """
    if (mime_type or "").strip().lower() == "image/webp":
        return convert_webp_to_png(image_data), ".png"
    return image_data, ext_for_mime(mime_type)


def output_with_ext(output_base: Path, ext: str) -> Path:
    """Attach an extension to a base path whose slug may not contain dots."""
    return output_base.parent / f"{output_base.name}{ext}"


def existing_output(output_base: Path):
    """Return an existing valid (>10KB) image for this slide, if any."""
    for ext in IMAGE_EXTS:
        candidate = output_with_ext(output_base, ext)
        if candidate.exists() and candidate.stat().st_size > 10000:
            return candidate
    return None


def list_prompt_files(prompts_dir: Path) -> list:
    """List prompt files (*.md and *.txt), preferring .md when both exist."""
    by_stem = {}
    # Insert .txt first, then .md so .md overrides a same-named .txt.
    for pattern in ("*.txt", "*.md"):
        for prompt_file in prompts_dir.glob(pattern):
            by_stem[prompt_file.stem] = prompt_file
    return [by_stem[stem] for stem in sorted(by_stem)]


def generate_slide(client, types, model: str, prompt: str, output_base: Path,
                   max_retries: int = 3):
    """Generate a single slide image with retry logic.

    Returns the Path the image was written to on success, or None on failure.
    """

    for attempt in range(max_retries):
        try:
            if attempt > 0:
                wait_time = 5 * (attempt + 1)
                print(f"  Retry {attempt}/{max_retries-1} (waiting {wait_time}s)...")
                time.sleep(wait_time)
            else:
                print(f"  Generating image...")

            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(
                        aspect_ratio="16:9",
                        image_size="4K"
                    )
                )
            )

            # Extract image from response
            if response.candidates:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data and part.inline_data.data:
                        image_data = part.inline_data.data
                        mime_type = getattr(part.inline_data, "mime_type", None)
                        try:
                            image_data, ext = finalize_image_data(image_data, mime_type)
                        except RuntimeError as convert_error:
                            print(f"  Error: {convert_error}")
                            if attempt == max_retries - 1:
                                return None
                            continue
                        output_path = output_with_ext(output_base, ext)
                        # Save image (data is already bytes)
                        output_path.parent.mkdir(parents=True, exist_ok=True)
                        with open(output_path, "wb") as f:
                            f.write(image_data)
                        size_kb = len(image_data) / 1024
                        saved_as = ext.lstrip(".").upper()
                        print(f"  Saved: {output_path.name} ({size_kb:.1f} KB, {saved_as})")
                        return output_path

            print(f"  Warning: No image in response")

        except Exception as e:
            print(f"  Error: {e}")
            if attempt == max_retries - 1:
                return None

    return None


GENERATED_LEDGER = "generated.json"


def record_generated(deck_dir: Path, output_path: Path, prompt_file: Path, model: str) -> None:
    """Record a freshly generated slide in generated.json (filename -> sha256, prompt, model).

    The merge scripts refuse any recorded slide without a matching proofread.json
    disposition (SKILL.md Step 6.5) — text-to-image garbles math and numbers, so an
    unchecked generated slide must not ship silently. A regenerated slide gets a new
    sha256, which voids its earlier proofread entry.
    """
    ledger = deck_dir / GENERATED_LEDGER
    slides = {}
    if ledger.exists():
        slides = json.loads(ledger.read_text(encoding="utf-8")).get("slides", {})
    # A slide re-generated under another extension replaces its old record.
    stem = output_path.stem
    slides = {name: entry for name, entry in slides.items() if Path(name).stem != stem}
    slides[output_path.name] = {
        "sha256": hashlib.sha256(output_path.read_bytes()).hexdigest(),
        "prompt": f"prompts/{prompt_file.name}",
        "model": model,
    }
    tmp = ledger.with_name(ledger.name + ".tmp")
    tmp.write_text(json.dumps({"slides": slides}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(ledger)


def find_slides_to_generate(prompt_files: list, output_dir: Path) -> list:
    """Find slides that need generation (prompts without a valid output)."""
    slides = []

    for prompt_file in prompt_files:
        slide_name = prompt_file.stem
        output_base = output_dir / slide_name

        # Skip if a valid output already exists (any image ext, > 10KB)
        if existing_output(output_base):
            continue

        slides.append({
            "name": slide_name,
            "prompt_file": prompt_file,
            "output_base": output_base,
        })

    return slides


def unrecorded_existing(prompt_files: list, output_dir: Path) -> list:
    """Existing slide images for these prompts that generated.json does not list.

    They are skipped (idempotence) but not recorded: they may be extracted figures, or
    AI images from an older run / the Gemini Web path. Only the agent knows which, so the
    run names them instead of guessing.
    """
    ledger = output_dir / GENERATED_LEDGER
    recorded = set()
    if ledger.exists():
        recorded = set(json.loads(ledger.read_text(encoding="utf-8")).get("slides", {}))
    names = []
    for prompt_file in prompt_files:
        found = existing_output(output_dir / prompt_file.stem)
        if found and found.name not in recorded:
            names.append(found.name)
    return names


def list_existing_slides(output_dir: Path) -> list:
    """List already-generated slide images in the output directory."""
    return sorted(
        p for p in output_dir.iterdir()
        if p.is_file() and SLIDE_IMAGE_RE.match(p.name)
    )


def main():
    parser = argparse.ArgumentParser(description="Generate slide images using Gemini API")
    parser.add_argument("slide_deck_dir", help="Directory containing prompts/ folder")
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help=(f"Gemini model to use (default: {DEFAULT_MODEL}). "
                              "The '-preview' id is deprecated post-GA."))
    args = parser.parse_args()

    # Initialize paths. Generated images land in the deck ROOT so they sit
    # alongside extracted-figure slides and are found by the merge scripts.
    deck_dir = Path(args.slide_deck_dir)
    prompts_dir = deck_dir / "prompts"
    output_dir = deck_dir

    if not prompts_dir.exists():
        print(f"Error: Prompts directory not found: {prompts_dir}")
        sys.exit(1)

    # Enumerate prompt files (.md / .txt) and report what was found FIRST, so
    # even an error-exit run tells the user which prompts were discovered.
    prompt_files = list_prompt_files(prompts_dir)
    print(f"Found {len(prompt_files)} prompt file(s) in {prompts_dir}:")
    for prompt_file in prompt_files:
        print(f"  - {prompt_file.name}")

    if not prompt_files:
        print("\nError: No prompt files found (expected *.md or *.txt in the "
              "prompts/ directory). Nothing to generate.")
        sys.exit(1)

    # Get API key
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("\nError: GOOGLE_API_KEY or GEMINI_API_KEY environment variable not set")
        sys.exit(1)

    # Find slides to generate
    slides = find_slides_to_generate(prompt_files, output_dir)
    unrecorded = unrecorded_existing(prompt_files, output_dir)
    if unrecorded:
        print(f"\nNote: {len(unrecorded)} existing slide(s) are skipped but not in {GENERATED_LEDGER}: "
              + ", ".join(unrecorded))
        print("If any of them is AI-generated (older run, Gemini Web), record it so the merge gate "
              "requires a proofread:\n  bun scripts/proofread.ts --record <deck-dir> <slide-file>")

    if not slides:
        print("\nAll slides already generated. Nothing to do.")
        existing = list_existing_slides(output_dir)
        print(f"\nExisting slides ({len(existing)}):")
        for slide in existing:
            size_kb = slide.stat().st_size / 1024
            print(f"  - {slide.name} ({size_kb:.1f} KB)")
        return

    # Check dependencies only once we know there is work and a key is present.
    genai, types = check_dependencies()

    # Initialize client
    client = genai.Client(api_key=api_key)

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nGenerating {len(slides)} slides using {args.model}...")
    print(f"Output directory: {output_dir}\n")

    success_count = 0
    failed_slides = []

    for i, slide in enumerate(slides):
        print(f"[{i + 1}/{len(slides)}] {slide['name']}")

        # Read prompt
        prompt = slide["prompt_file"].read_text(encoding="utf-8")

        # Generate slide
        written = generate_slide(client, types, args.model, prompt, slide["output_base"])
        if written:
            record_generated(deck_dir, written, slide["prompt_file"], args.model)
            success_count += 1
        else:
            failed_slides.append(slide["name"])

    print(f"\nDone! Generated {success_count}/{len(slides)} slides.")
    if success_count:
        print("Proofread every generated slide before merging (SKILL.md Step 6.5):\n"
              "  bun scripts/proofread.ts --mark <deck-dir> <slide-file> ok|check [--note \"…\"]")

    if failed_slides:
        print(f"\nFailed slides ({len(failed_slides)}):")
        for name in failed_slides:
            print(f"  - {name}")
        print("Re-run this script to retry only the failed slides "
              "(completed slides are skipped automatically).")
        # 失败必须反映在退出码上：exit 0 会让下游 merge 放行缺页 deck，
        # 而 merge 的间隙警告只会把它归因于「删除过幻灯片」误导排查方向
        sys.exit(1)

    # List all slides in output directory
    all_slides = list_existing_slides(output_dir)
    print(f"\nTotal slides in output: {len(all_slides)}")
    for slide in all_slides:
        size_kb = slide.stat().st_size / 1024
        print(f"  - {slide.name} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
