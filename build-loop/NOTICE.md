# Notice

`build-loop` adapts and condenses material from **agent-skills** by Addy Osmani and contributors
(https://github.com/addyosmani/agent-skills), used under the MIT License:

> MIT License
>
> Copyright (c) 2025 Addy Osmani
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Differences from the original: the 25 skills are merged into one autonomous loop (no approval gates between phases), with the topic skills condensed into `references/`.

---

The Replica track (`references/replica.md`), the tools in `scripts/` (`parity.py`, `imgdiff.py`, `sweep.py`, `contrast.py`, `reviews.py`, `themes.json`, `listing.py`) and the templates in `assets/replica/` adapt and include material from **The Replica skill** by Jake Schincariol (https://github.com/Jakeschincariol/replica-skill), used under the MIT License:

> MIT License
>
> Copyright (c) 2026 Jake Schincariol
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Differences from the original Replica skill: the eleven skills are condensed into one track (R1–R11) inside build-loop; scope questions become logged decisions; going live follows build-loop's permission rules; `sweep.py` gains an `--allow` list (and `"allow"` config key) for identifiers a project must keep stable. The other tools are unchanged.

---

The specialist personas in `agents/` (all 18 divisions, bundled unchanged as one file per division; `scripts/persona.py --export` restores the original files byte for byte), the team runbooks and coordination templates in `agents/strategy/`, come from **agency-agents** by AgentLand Contributors (https://github.com/msitarzewski/agency-agents), used under the MIT License; the full licence text is in `agents/LICENSE-agency-agents.txt` (Copyright (c) 2025 AgentLand Contributors). `agents/ROSTER.md` is generated from the personas' frontmatter, and `references/specialists.md` is new. The upstream install and conversion scripts are not included.

---

The skills in `vendor/` are bundled unchanged, one Markdown file per source (`scripts/vendor.py --export` restores the original files byte for byte; binaries were left out). Full licence texts and the claude-mem NOTICE are in `vendor/LICENSES.md`.

- **reverse-api-engineer** — https://github.com/kalil0321/reverse-api-engineer — MIT, Copyright (c) 2025 kalil0321
- **REA (reverse-engineer-anything skill)** — https://github.com/morluto/rea — MIT, Copyright (c) 2026 morluto
- **Fish Audio plugin skills** — https://github.com/fishaudio/fish-audio-plugin — MIT, Copyright (c) 2026 Fish Audio
- **Strix skills** — https://github.com/usestrix/strix — Apache License 2.0, Copyright 2025 OmniSecure Inc.
- **claude-mem skills** — https://github.com/thedotmack/claude-mem — Apache License 2.0, Copyright 2026 Alex Newman
- **Anthropic skills** — https://github.com/anthropics/skills — Apache License 2.0 (each skill's LICENSE.txt is bundled with it); the `docx`, `pdf`, `pptx` and `xlsx` skills are not included.

`scripts/vendor.py`, `vendor/CATALOG.md`, and `references/vendored-skills.md`, `reverse-engineering.md`, `voice.md` and `ai-providers.md` are new. FreeLLMAPI (https://github.com/tashfeenahmed/freellmapi, MIT) is described in `references/ai-providers.md` but no code from it is included.
