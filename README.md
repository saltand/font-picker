# DOM Hover Highlighter

A minimal WXT Chrome MV3 extension that highlights DOM elements while hovering.

## Commands

```sh
pnpm install
pnpm run build
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome.

## Manual Test Page

Serve the project directory over HTTP, then open the overlap test page:

```sh
python3 -m http.server 8000
```

```text
http://localhost:8000/test-pages/overlap.html
```

Click the extension icon, hover the overlapping boxes, press `Shift` or `Ctrl`
to move through the element stack, and press `Esc` to exit.
