# Vendored libraries

## Gridstack.js (grid-based dashboard layout)

The dashboard's movable/resizable sections are powered by
[Gridstack.js](https://github.com/gridstack/gridstack.js) (MIT), pinned to
**v10.3.1**.

- `gridstack.min.css` — bundled in this folder ✅
- `gridstack-all.js` — **must be downloaded** (the all-in-one UMD build that
  defines the global `GridStack`). It is ~250 KB, so it is not checked in by the
  setup tooling.

### One-time download

From the repository root, run:

```bash
curl -L -o newtab/vendor/gridstack-all.js \
  https://cdn.jsdelivr.net/npm/gridstack@10.3.1/dist/gridstack-all.js
```

After this file exists, reload the extension and the grid layout activates.
If the file is missing, the dashboard falls back to the classic (non-grid)
section rendering so it never breaks.
