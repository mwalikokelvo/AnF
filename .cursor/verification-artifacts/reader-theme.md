# Reader theme contrast

Browser fixture (headless Chrome), not an installed app.

## Before

Sampled from the previous fixture shots:

| Surface | Measured |
|---|---|
| Dark, light, and amber borders | about 3.07:1 (`#606d7a`, `#909090`, `#725b41`) |
| Light focus, meter, and quote | about 3.10:1 |
| Start OCR Server | workspace surface `#182a2d` on every reader theme |
| Light glass border | about 1.2:1, with a 24px blur halo over the dark page |
| Light canvas behind the rail | `#101e21` showing through |

## After

- Themes dark, black, sepia, light, amber change background and ink.
- Reading column, toolbar, glass rail, and header keep their boxes. Resizing 1100px to 640px and back does not leave the page mid-transition.
- Scroll stays at 140px and the document text is not rebuilt.
- Title, aside heading, page text, placeholders, and the OCR control stay at least 4.5:1. Shell borders, focus, meter, and quote stay at least 4.5:1.
- The open light rail is opaque (`backdrop-filter: none`). Its border is rgb(91, 112, 103) on rgb(238, 241, 235) (4.65:1). The canvas is rgb(245, 246, 242), not the dark page color.
- Console warnings: none.
- Transition: `--reader-bg, --reader-ink, --reader-line, --reader-focus, --reader-meter, --reader-quote`.
