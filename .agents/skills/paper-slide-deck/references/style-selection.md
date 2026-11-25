# Style Selection

Read this file when choosing a visual style: from an explicit `--style <name>`, or by
auto-selecting from content signals. The full specification for each style lives in
`references/styles/<style>.md`.

## Style Gallery

| Style | Description | Best For |
|-------|-------------|----------|
| `academic-paper` | Clean professional, precise charts | Academic-style visuals, technical handouts (for a faithful *editable* talk use scholar-slides) |
| `blueprint` (Default) | Technical schematics, grid texture | Architecture, system design |
| `chalkboard` | Black chalkboard, colorful chalk | Education, tutorials, classroom |
| `notion` | SaaS dashboard, card-based layouts | Product demos, SaaS, B2B |
| `bold-editorial` | Magazine cover, bold typography, dark | Product launches, keynotes |
| `corporate` | Navy/gold, structured layouts | Investor decks, proposals |
| `dark-atmospheric` | Cinematic dark mode, glowing accents | Entertainment, gaming |
| `editorial-infographic` | Magazine explainers, flat illustrations | Tech explainers, research |
| `fantasy-animation` | Ghibli/Disney style, hand-drawn | Educational, storytelling |
| `intuition-machine` | Technical briefing, bilingual labels | Technical docs, academic |
| `minimal` | Ultra-clean, maximum whitespace | Executive briefings, premium |
| `pixel-art` | Retro 8-bit, chunky pixels | Gaming, developer talks |
| `scientific` | Academic diagrams, precise labeling | Biology, chemistry, medical |
| `sketch-notes` | Hand-drawn, warm & friendly | Educational, tutorials |
| `vector-illustration` | Flat vector, retro & cute | Creative, children's content |
| `vintage` | Aged-paper, historical styling | Historical, heritage, biography |
| `watercolor` | Hand-painted textures, natural warmth | Lifestyle, wellness, travel |

## Auto Style Selection

Use when the user did not pass `--style`. Match content signals in order; fall back to `blueprint`.

| Content Signals | Selected Style |
|-----------------|----------------|
| paper, thesis, ieee, acm, icml, neurips, cvpr, acl, aaai, iclr | `academic-paper` |

> Routing note: content mentioning defense/conference can still pick this **visual style**,
> but if the user needs a live, projector-ready talk with exact math and numbers, route to
> the scholar-slides skill instead of this one.
| tutorial, learn, education, guide, intro, beginner | `sketch-notes` |
| classroom, teaching, school, chalkboard, blackboard | `chalkboard` |
| architecture, system, data, analysis, technical | `blueprint` |
| creative, children, kids, cute, illustration | `vector-illustration` |
| briefing, bilingual, infographic, concept | `intuition-machine` |
| executive, minimal, clean, simple, elegant | `minimal` |
| saas, product, dashboard, metrics, productivity | `notion` |
| investor, quarterly, business, corporate, proposal | `corporate` |
| launch, marketing, keynote, bold, impact, magazine | `bold-editorial` |
| entertainment, music, gaming, creative, atmospheric | `dark-atmospheric` |
| explainer, journalism, science communication | `editorial-infographic` |
| story, fantasy, animation, magical, whimsical | `fantasy-animation` |
| gaming, retro, pixel, developer, nostalgia | `pixel-art` |
| biology, chemistry, medical, pathway, scientific | `scientific` |
| history, heritage, vintage, expedition, historical | `vintage` |
| lifestyle, wellness, travel, artistic, natural | `watercolor` |
| Default | `blueprint` |

> **Academic-signal caution**: When the content matches `academic-paper` signals (paper/thesis/neurips/cvpr/icml/…), this skill still bakes text into an image, so **equations, result tables, and exact numbers may be garbled**. Extract real figures/tables from the source PDF (`Source: extract`) rather than letting the model redraw them, and if the deck needs faithful, editable formulas/data, tell the user to use **scholar-slides** instead.
