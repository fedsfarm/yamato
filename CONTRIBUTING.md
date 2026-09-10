# Contributing

Update existing scripts. Add sites in `site-modules.js`; settings appear automatically.

```js
{ id: 'example', name: 'Example', hosts: ['example.com'],
  items: 'article', markers: '[data-sensitive="true"]',
  warning: /^sensitive content$/i,
  flagged: data => data.sensitive === true },
```

Keep IDs stable. Use platform warnings, not post keywords. `flagged` needs no DOM;
use `() => false` without API flags. Optional: `detect(doc)` for variable hosts,
`sensitive(item)` for extra warnings. Search engines go in the tuple list.

`background.js`: blocking. `media.js` / `media.css`: replacements.
`site-guard.js`: page hooks. `run.js`: full-page effect. `offscreen.js`: audio.
`popup.js`: settings. `build.sh` / `build-media-rules.js`: packaging.

Build: install Deno, FFmpeg and zip, then run `deno task build`.
Load `dist-chrome` / `dist-firefox`; check safe, flagged and new posts in
`off`, `jc` and `jce` modes. Edit sources, not generated files. Open a PR.