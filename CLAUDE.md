# CLAUDE.md

Static pension-savings calculator. No build, no dependencies, no external requests —
`index.html`, `style.css`, `app.js` are shipped verbatim to GitHub Pages.

## Conventions

- **Dutch** for UI copy, code comments, README and commit messages. Code identifiers
  are Dutch too (`MAANDINLEG`, `rendement`); keep it that way.
- `app.js` is ES5-style (`var`, `function`, no modules) and loaded as a plain
  `<script>`. Don't introduce `import`, a bundler, a chart library, or a package.json —
  the "no dependencies" property is the point of this repo, and the Pages workflow
  uploads the repo root as-is.
- Colours never appear literally in `app.js`; the SVG reads CSS custom properties via
  `token('--name')`. New colours go in **all three** token blocks in `style.css`
  (`:root`, the `prefers-color-scheme: dark` media query, and `:root[data-theme="dark"]`),
  otherwise a theme silently loses them.
- Anything that changes what is drawn must call `render()` (state → `project()` → controls,
  legend, chart). `drawChart()` alone is only for resize, where the model is unchanged.
- The y-axis is deliberately unlabelled: the amounts are fictional, the curve's *shape*
  is the message. Don't "improve" it by adding euro values to the gridlines.

## Checks before saying it works

`node --check app.js` — the same syntax check the Pages workflow runs. Run it after every
change to `app.js`.

Don't launch a browser on your own initiative. Reason about the change from the code, say
what you changed, and leave the looking to the user unless they ask for it.

## Visual check with Playwright — only when asked

**Run this only on an explicit request** ("check it in the browser", "screenshot it",
"does it look right?"). It is not part of the normal edit loop: it installs a
package and costs a minute for images nobody asked for. If you think a change really
warrants a look, offer it in one sentence and let the user decide.

When they do ask — Playwright isn't a project dependency, so install it in the scratchpad
and keep it out of the repo:

```bash
S="$SCRATCHPAD"           # session scratchpad dir from the system prompt
(cd "$S" && npm install --silent playwright)   # browsers are already in ~/.cache/ms-playwright
```

Quick single shot:

```bash
npx playwright screenshot --viewport-size=1280,900 "file://$PWD/index.html" "$S/shot.png"
```

Both themes plus an interaction — write this to `$S/shot.mjs` (it must live next to
`$S/node_modules` so the import resolves) and run
`APP_DIR=$PWD node "$S/shot.mjs" "$S/check"`:

```js
import { chromium } from 'playwright';

const url = 'file://' + (process.env.APP_DIR || process.cwd()) + '/index.html';
const out = process.argv[2] || '/tmp/shot';
const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);

  const slider = page.locator('#rendement');
  await slider.fill('12');
  await slider.dispatchEvent('input');        // fill() alone doesn't fire the input handler
  await page.getByRole('radio', { name: 'Eenmalige inleg' }).click();
  await page.waitForTimeout(100);             // ResizeObserver redraw

  await page.screenshot({ path: `${out}-${theme}.png` });
  console.log(theme, await page.locator('#rendement-out').textContent(),
              '| paths:', await page.locator('#chart-wrap svg path').count(),
              '| errors:', errors.length ? errors : 'none');
  await page.close();
}
await browser.close();
```

Then **read the PNGs** — a green console line is not a visual check.

Notes:
- `file://` works; no server needed. `localStorage` is available there in Chromium, so the
  theme button is clickable and really persists — but each `chromium.launch()` starts with
  an empty store, so to *start* in a theme set `data-theme` on `<html>` as above.
- The chart is drawn from `host.clientWidth`, so viewport width changes the SVG.
  Compare screenshots at the same viewport, and check ≤900px too — the layout collapses
  to one column there.
- Expect 2 `<path>` elements (filled area + line). Zero or one means the draw broke.

## Deploy

Push to `main` → `.github/workflows/pages.yml` syntax-checks `app.js` and publishes the
repo root. Requires **Settings → Pages → Source: GitHub Actions** (one-off). All paths are
relative, so the `/<repo>/` subpath needs no configuration.
