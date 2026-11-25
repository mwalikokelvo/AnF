# Figure Container Template

Visual specifications for applying the academic-paper style container to extracted PDF figures.

## Container Dimensions

| Property | Value | Notes |
|----------|-------|-------|
| Aspect Ratio | 16:9 | Standard presentation format |
| Resolution | 1920 x 1080 px | Full HD |
| High-Res Option | 3840 x 2160 px | 4K for print quality |

## Layout Specifications

```
┌─────────────────────────────────────────────────────────────────┐
│                           TITLE AREA                            │
│            first line centered on y=80, wraps as needed         │
│                (line height = font size × 1.3)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                       FIGURE AREA                               │
│        centered between title bottom and caption top            │
│                     max 85% width                               │
│                     max 65% height (and never into              │
│                     the title/caption bands)                    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                         CAPTION AREA                            │
│    first line centered on y=1000 (HEIGHT−80); a multi-line      │
│    block is clamped upward so the last line stays on canvas     │
└─────────────────────────────────────────────────────────────────┘
```

## Dimensions (1920x1080)

The authoritative source for these numbers is `scripts/apply-template.ts` (`LAYOUT` constants); this table mirrors it — keep the two in sync when editing.

| Area | Position | Size |
|------|----------|------|
| Title | first line centered on y: 80px | font 48px bold, line height 62px (×1.3) |
| Figure Container | centered in the space between title block and caption block | max-width: 1632px (85%), max-height: 702px (65%, further limited by the available area) |
| Caption | first line centered on y: 1000px (HEIGHT−80) | font 24px italic, line height 34px (×1.4); multi-line blocks clamp upward |
| Padding | around the figure box | 20px |

## Color Specifications (academic-paper style)

| Element | Color | Hex |
|---------|-------|-----|
| Background | White | #FFFFFF |
| Title Text | Dark Blue-Gray | #1E3A5F |
| Caption Text | Medium Gray | #6B7280 |
| Figure Border | Light Gray | #E5E7EB |
| Figure Shadow | Gray (10% opacity) | rgba(0,0,0,0.1) |

## Typography

### Title
- Font: Sans-serif (system default: Arial, Helvetica; override with `--font` for CJK, e.g. "Noto Sans CJK SC, Arial, sans-serif")
- Size: 48px (1920w) / 96px (3840w)
- Weight: Bold (700)
- Color: #1E3A5F
- Alignment: Center
- Wrapping: automatic, width limit 90% — Latin words stay whole, every CJK character is a break point, and an unbreakable token wider than the line is hard-broken. **Recommend ≤ 2 lines**; each extra line pushes the figure area down.

### Caption
- Font: Sans-serif (system default: Arial, Helvetica; same `--font` override)
- Size: 24px (1920w) / 48px (3840w)
- Weight: Normal (400)
- Style: Italic
- Color: #6B7280
- Alignment: Center
- Format: "Figure N: [Caption text]"
- Wrapping: same CJK-aware rules, width limit 85%. A multi-line block is measured **before** the figure is laid out and clamped upward so no line runs off the bottom edge; the figure area shrinks accordingly (a warning is printed when title + caption crowd out the figure).

## Figure Area Styling

### Container
- Background: White (#FFFFFF)
- Border: 1px solid #E5E7EB
- Border Radius: 8px
- Box Shadow: 0 4px 6px rgba(0,0,0,0.1)
- Padding: 20px

### Figure Scaling
- Maintain aspect ratio
- Scale to fit container (contain mode)
- Center horizontally and vertically
- Minimum margin from container edge: 20px

## Implementation Notes

### Canvas Setup (Node.js)

```typescript
import { createCanvas, loadImage } from 'canvas';

const WIDTH = 1920;
const HEIGHT = 1080;

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');

// Background
ctx.fillStyle = '#FFFFFF';
ctx.fillRect(0, 0, WIDTH, HEIGHT);
```

### Title Rendering

```typescript
ctx.fillStyle = '#1E3A5F';
ctx.font = 'bold 48px Arial, Helvetica, sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
// wrapText breaks on Latin word boundaries and between individual CJK
// characters — a Chinese title is NOT one unbreakable token.
const titleLines = wrapText(ctx, title, WIDTH * 0.9);
titleLines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, 80 + i * 62));
```

### Figure Placement

```typescript
// Load and scale figure. The available area sits between the title block
// bottom and the caption block top — not the whole canvas.
const titleBottomY = 80 + titleLines.length * 62 + 2 * 20;
const maxWidth = WIDTH * 0.85;
const maxHeight = Math.min(HEIGHT * 0.65, captionTopY - titleBottomY - 2 * 20);

const scale = Math.min(maxWidth / figure.width, maxHeight / figure.height);
const scaledWidth = figure.width * scale;
const scaledHeight = figure.height * scale;

// Centered in the available area
const x = (WIDTH - scaledWidth) / 2;
const y = titleBottomY + (availableHeight - scaledHeight) / 2;

// Draw shadow + rounded border + figure (see apply-template.ts drawRoundedRect)
```

### Caption Rendering

```typescript
// Lines are measured BEFORE the figure is laid out, and the block is clamped
// so the last line stays inside the canvas (multi-line captions used to run
// off the bottom edge).
ctx.fillStyle = '#6B7280';
ctx.font = 'italic 24px Arial, Helvetica, sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
const lines = wrapText(ctx, `Figure ${figureNum}: ${caption}`, WIDTH * 0.85);
const captionY = Math.min(HEIGHT - 80, HEIGHT - 20 - (lines.length - 1) * 34);
lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, captionY + i * 34));
```

## Variants

### Minimal Container
- No border or shadow
- Figure fills more space (90% width)
- Smaller title/caption (36px/18px)

### With Sub-caption
- Add second line below caption
- For additional notes or source attribution
- Smaller font (18px), lighter gray (#9CA3AF)

### Table Container
- Same layout as figure
- Replace "Figure N" with "Table N"
- Consider larger padding for table borders

## Output Format

- Format: PNG
- Color Space: sRGB
- Compression: Lossless
- Filename: Same as slide filename from outline
