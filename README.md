# DOM Hover Highlighter

A minimal WXT Chrome MV3 extension that highlights DOM elements while hovering
and shows the selected element's rendered fonts.

## Commands

```sh
pnpm install
pnpm run build
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome.

The extension uses Chrome's `debugger` permission to read rendered font data
through the Chrome DevTools Protocol. Chrome may show a debugging notice while
font data is being read.

The extension UI is localized with WebExtension `_locales`. English is the
default; Simplified Chinese and Traditional Chinese are used automatically when
Chrome's UI locale is Chinese.

The highlighter content script is injected on demand after the toolbar icon is
clicked. It is not loaded automatically on every page.

## Manual Test Page

Serve the project directory over HTTP, then open the overlap test page:

```sh
python3 -m http.server 8000
```

```text
http://localhost:8000/test-pages/overlap.html
```

Click the extension icon, hover the overlapping boxes, check the rendered font
panel, press `ArrowDown` or `ArrowUp` to move through the element stack, and
press `Esc` or click the left/right mouse button to exit.
