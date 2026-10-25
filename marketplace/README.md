# AnF marketplace

`registry.json` lists add-ons. AnF fetches it only when the user presses **Browse marketplace**.
Each entry needs `downloadUrl` (under this folder on `main`) and the `sha256` of the file;
after editing a theme run `sha256sum marketplace/<id>/theme.css` and update the registry.

Themes are plain CSS that override AnF's variables on `#workspace-root`. They may not use
`@import` or `url()` except `url(data:…)`. Plugins are not installable yet.
