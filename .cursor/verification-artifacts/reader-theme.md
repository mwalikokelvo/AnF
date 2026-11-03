# Reader theme transitions

Browser fixture (headless Chrome), not an installed app.

- Themes dark, black, sepia, light, amber change background and ink.
- Reading column, toolbar, glass rail, and header keep their boxes.
- Scroll stays at 140px and the document text is not rebuilt.
- Title, aside heading, and page text stay at least 4.5:1. Control borders stay at least 3:1. Placeholders stay at least 4.5:1.
- Console warnings: none.
- Transition: `--reader-bg, --reader-ink, --reader-line, --reader-focus, --reader-meter, --reader-quote`.
