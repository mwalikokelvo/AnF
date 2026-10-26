# AnF marketplace

`registry.json` lists add-ons. AnF fetches it only when the user presses **Browse marketplace**.
Each entry needs `downloadUrl` (under this folder on `main`) and the `sha256` of the file;
after editing a theme run `sha256sum marketplace/sample-theme/theme.css` and update the registry.

Themes are plain CSS that override AnF's variables on `#workspace-root`. They may not use
`@import` or `url()` except `url(data:…)`. Plugins are not installable yet.

## Writing a theme that works on every platform

Windows and Android read the same registry and apply the same CSS. Windows paints from `#workspace-root`, Android from `html`, so a theme should set the colour variables on all of them and also colour `html`, as `sample-theme/theme.css` does:

```css
:root,html,html[data-theme],#workspace-root,#workspace-root[data-theme]{ --bg:#1e1e2e; --ink:#cdd6f4; /* … */ }
html,html[data-theme]{background:var(--bg);color:var(--ink)}
```

Whenever a file in `marketplace/` changes, update its `sha256` in `registry.json`. CI checks this.
