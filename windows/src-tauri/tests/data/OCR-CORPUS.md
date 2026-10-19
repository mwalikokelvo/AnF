# OCR regression corpus

The original `scan.jpg` and `scan.pdf` are preserved byte for byte. The existing
`seven letters` expectation is unchanged. AnF 0.1.31 rendered this PDF at
1600×2240, then unnecessarily resized it to 1714×2400 with Triangle filtering;
actual inference dropped the `l` from `letters`. Preserving the native pixel grid
restores that phrase. Upsampling with Lanczos or cropping whitespace introduced
other recognition/layout errors in controlled comparisons, so neither is used.

`ocr-native-small.png` is an independent 1200×700 raster, with English, French
and Spanish sentences and a bottom-of-page footnote. `ocr-noisy-skew.jpg` applies
a 1.5° skew, deterministic small pixel noise and JPEG quality 58 to the same
independent content. Both retain strict phrase/footnote assertions using real
bundled OCR models. Neither fixture is copied or derived from the failing PDF.
The generator uses the bundled OFL Atkinson Hyperlegible font and records its
seed and transformations; the rasterized test images contain no private data.

Current evidence: the original scanned-PDF test and all three native-grid / image
limit / PDF geometry tests pass. The independent corpus is a deliberately retained
**failing ignored diagnostic**, not a passing release claim: the bundled recognizer
reads the initial `El` as `Fl` in the clean native raster. Its exact phrase and
footnote expectations remain unchanged. The first failure prevents the current
diagnostic run from reaching the noisy/skewed image, so that case is not yet
verified. Repairing this remaining model/font recognition defect is separate from
the measured resampling regression fixed here. No dictionary or text repair is
used to turn a failing output into a passing one.

These languages use the model's shared ASCII Latin alphabet. The current bundled
recognizer does **not** support arbitrary diacritics, Cyrillic, CJK or other scripts;
this corpus does not imply that capability. Small angle skew is tested, not
automatic recovery of sideways or upside-down pages. Model errors can still occur;
no dictionary substitutions, hardcoded corrections or text expectations are used
to choose an inference result.

Memory bounds: decoder maximum remains 10,000 pixels per axis / 128 MB allocation,
and decoded images above 25 megapixels are rejected. Existing pixels are retained
when within 1800×2400; larger accepted rasters are reduced to fit those bounds
(at most 4.32 MP / 12.96 MB RGB, plus at most 17.28 MB normalized grayscale tensor).
Decoder/source/model/inference workspaces also consume memory; these numbers are
not a total process RSS limit. PDF OCR separately targets at most 1600×2400, and
both dimensions are bounded **before** Windows allocates the render bitmap, even
for extreme page aspect ratios. Display preview sizing is independent.
