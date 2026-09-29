# LAV – Labská akademie veslování

## Overview

A static multi-page website for **Labská akademie veslování** (LAV). There is no frontend framework: pages are plain HTML built from partials with Gulp, styled with Tailwind CSS 3 (via Sass + PostCSS), and use vanilla JS. Any JS that needs npm packages goes into `*.parcel.js` entry files, which Parcel bundles as one step of the Gulp build. Everything is compiled into `dist/`, which is the deployable output. It is not committed.

## Tech stack

| Tool | Role |
| --- | --- |
| **Gulp 5** (`gulpfile.js`) | Task runner: orchestrates every step below |
| **gulp-file-include** | HTML partials (`@@include(...)`), prefix `@@`, paths relative to the including file |
| **Tailwind CSS 3** + **Sass** (`gulp-sass`) + **PostCSS** (autoprefixer) | Styles: `src/styles/main.scss` → `dist/css/main.css`. Design tokens are in `tailwind.config.js` |
| **Parcel 2** (`@parcel/core` API, called from Gulp) | Bundles `src/js/*.parcel.js`, so `import` from npm works (Swiper, GSAP, three.js) |
| **gulp-svg-sprite** (+ SVGO) | Builds the icon sprite `src/icons/*.svg` → `dist/img/_symbols.svg` |
| **browser-sync** | Dev server on `dist/` with live reload / CSS injection |
| **gulp-imagemin** | Image optimization `src/img/**` → `dist/img/` (mozjpeg q80, optipng, gifsicle, svgo) |

Runtime npm dependencies: `swiper`, `gsap`, `three`.

## Getting started

**Prerequisites:** Node.js + npm. No version is pinned: `package.json` has no `engines` field and there is no `.nvmrc`. The project is currently developed on **Node 22.17.0**. Use a current LTS (≥ 18). `gulp-imagemin` 9 is ESM-only and is loaded through a dynamic `import()`, so very old Node versions will not work.

```bash
npm install
npm run dev     # gulp dev   – clean build, then browser-sync on dist/ + watchers (Parcel in watch mode)
npm run build   # gulp build – clean production build: minified CSS, optimized JS, no sourcemaps
```

- The dev server does not open a browser automatically (`open: false`). Use the Local URL that browser-sync prints (normally `http://localhost:3000`).
- Individual tasks also exist: `npx gulp html|styles|scripts|icons|images|fonts|clean`.
- Production mode means `NODE_ENV=production` **or** running the `build` task.

**Build order matters:** `icons` runs first, then `html`, because `components/sprite.html` inlines the generated `dist/img/_symbols.svg`. Styles are compiled after the HTML because Tailwind scans `src/**/*.html` and `src/js/**/*.js` for class names.

## Project structure

```
src/
├── index.html              Homepage. Top-level src/*.html = pages; each becomes dist/<name>.html
├── components/             Partials (@@include)
│   ├── header.html         Shared site header (sticky, transparent → light on scroll)
│   ├── footer.html         Shared site footer (incl. "LAV" wordmark)
│   ├── icon.html           Icon partial: <svg><use href="#sprite-NAME"> (usage notes inside)
│   ├── sprite.html         Inlines dist/img/_symbols.svg once per page (visually hidden)
│   └── homepage/           Homepage-only sections, in page order:
│       ├── hero.html       …also loads its own entry js/hero.parcel.js
│       ├── gallery.html
│       ├── crossroad.html  "Rozcestník": sticky title + cards
│       ├── right-now.html  "Aktuálně v akademii": bento widgets
│       ├── instagram.html
│       └── partners.html
├── styles/
│   └── main.scss           Single stylesheet: Tailwind layers, @font-face, component + motion styles, page scene
├── js/                     Only *.parcel.js entries (see below)
│   ├── main.parcel.js      Swiper (hero articles, gallery), header scroll state, crossroad drift, bento reveal, footer wordmark
│   └── hero.parcel.js      Hero water shader (three.js, lazy-loaded) + title reveal (GSAP SplitText)
├── icons/                  Sprite source SVGs, one icon per file; file name = icon name
├── img/                    Raster images → dist/img/ (optimized)
│   └── scene/              Page background scene (bg-scene-a.jpg)
└── fonts/                  Self-hosted woff2 (Inter 500, Play 700, Schibsted Grotesk 700; latin + latin-ext)
```

Other root folders:
- `reference/`: design screenshots (PNG) the layout was measured from. Many comments cite them.
- `animace/`, `scene/`: motion spec images and raw scene sources. They are **git-ignored**, so they exist only locally.
- `dist/`, `.parcel-cache/`: build output and Parcel cache (git-ignored).

## The `.parcel.js` convention

Gulp handles HTML, CSS and assets but can't resolve `import 'gsap'`. Instead of moving the whole project to a second bundler, only JS files named **`src/js/*.parcel.js`** go through Parcel. The Gulp `scripts` task calls Parcel's Node API with those files as entries, and each entry is emitted to `dist/js/<same name>.parcel.js` as an ES module. In `dev`, Parcel runs in watch mode and triggers a browser-sync reload.

Packages currently imported this way:
- **swiper** (`swiper`, `swiper/modules`): `main.parcel.js`
- **gsap** (`gsap`, `gsap/ScrollTrigger`, `gsap/SplitText`): `main.parcel.js`, `hero.parcel.js`
- **three**: `hero.parcel.js`, via a dynamic `import('three')`. Parcel splits it into its own chunk, so visitors with reduced motion or without WebGL never download it.

To add npm-backed JS:
1. `npm install <pkg>`
2. Create `src/js/<name>.parcel.js` and `import` from the package.
3. Reference it as `<script type="module" src="js/<name>.parcel.js"></script>` (from a page or a partial, like `hero.html` does).

Do not add CDN `<script>` tags. Plain JS files without the `.parcel.js` suffix are **not** built or copied.

## Icon sprite system

- Put one SVG per icon into `src/icons/`. The `icons` task builds a `<symbol>` sprite at `dist/img/_symbols.svg`, and each symbol id is `sprite-<filename>` (case-sensitive, e.g. `sprite-Group-1`).
- Per icon, SVGO removes metadata and dimensions, converts colors to **`currentColor`** and prefixes internal ids. Path data is left untouched. **Exceptions:** `logo.svg` and `logo-nobg.svg` keep their original colors (the `multicolorIcons` list in `gulpfile.js`).
- Icons without a valid `viewBox` or with an embedded raster `<image>` are skipped, with a warning in the console.
- The sprite is **inlined** into each page by `components/sprite.html`, so `<use>` references a local `#sprite-<name>` and not an external file URL.
- Usage (path is relative to the including file; always pass `class`, at least a size):

  ```html
  @@include('./components/icon.html', {"name": "search", "class": "h-5 w-5"})       <!-- from src/*.html -->
  @@include('./icon.html', {"name": "arrow-right", "class": "h-5 w-5"})            <!-- from src/components/*.html -->
  @@include('../icon.html', {"name": "arrow-right", "class": "h-5 w-5"})           <!-- from src/components/homepage/*.html -->
  ```

  Output: `<svg class="h-5 w-5" aria-hidden="true" focusable="false"><use href="#sprite-search"></use></svg>`. Set the color with `text-*` on the icon or its parent. Icons are decorative only, so meaningful ones need an `aria-label` or sr-only text on the parent link/button.

## Background scene

In `index.html`, the header and `<main>` are wrapped in `<div class="page-scene">` (styles: `.page-scene` in `main.scss`). One wide illustration (`src/img/scene/bg-scene-a.jpg`, 1440 × 5200) sits behind everything above the footer:

- It is **scaled by width only** (container query units, `100cqw / 1440`) and never by content height. It is capped at 1440px (`max-w-container`) and centered. Wider viewports fill the sides with the edge color `#c4d1d9` and soft-mask the image edges.
- The image is split at source row 4411. The **top piece** (`::before`) is anchored to the top. The **bottom piece** (`.page-scene__bottom`: rocks + navy) is anchored to the bottom, so it always sits directly on the footer.
- If the content is taller than the scaled image, the gap between the two pieces is filled by a 1px-tall strip image (a `repeat-y` data-URI, the field color plus the vertical line), so the illustration continues without stretching. The wrapper's `aspect-ratio` keeps it at least one full image tall.
- `::after` is a navy gradient with an eased mask. It fades the bottom of the scene into the top edge of the footer (`.site-footer`, background `footer-bg.jpg`).

## Motion / animations

| Animation | Where | Technique |
| --- | --- | --- |
| Hero water shader (+ 0.3× scroll parallax) | `hero.parcel.js` | three.js WebGL, lazy-loaded; fades in over the static photo |
| Hero title reveal (masked words, 700 ms, 60 ms stagger) | `hero.parcel.js` | GSAP SplitText; CSS failsafe shows the title after 2 s if JS never runs |
| Header transparent → light (past 80px scroll) | `main.parcel.js` + CSS | rAF-throttled scroll listener toggles a class; 300 ms CSS transition |
| Hero articles / gallery sliders | `main.parcel.js` | Swiper (gallery = free-drag with momentum) |
| Crossroad sticky title | `crossroad.html` | CSS `position: sticky` (md+) |
| Crossroad card grain drift + hover lift | `main.parcel.js` + CSS | CSS keyframes (12 s), running only while on screen via IntersectionObserver |
| Bento card reveal + progress bars | `main.parcel.js` + CSS | IntersectionObserver adds classes; CSS transitions (fade/rise, bars `scaleX`) |
| Bento medal count-up numbers | `main.parcel.js` | IntersectionObserver + `requestAnimationFrame` (ease-out-expo, no GSAP) |
| Instagram marquee (30 s) / Partners marquee (40 s) | `main.scss` | CSS keyframes over a doubled track (`translateX(-50%)`), pause on hover |
| Link/button micro-interactions (arrow mask, underline, pill press) | `main.scss` | CSS transitions |
| Footer "LAV" wordmark reveal | `main.parcel.js` | GSAP ScrollTrigger (y + clip-path, once) |

**Reduced motion (`prefers-reduced-motion: reduce`)** is checked everywhere. The shader, parallax, title reveal, crossroad drift and lift, bento reveal and count-up, partners marquee and wordmark reveal do not run, and their content renders in its final state. Some cues deliberately remain, following the motion spec (`animace/08-reduced-motion.png`):
- The header state change becomes a ≤150 ms crossfade.
- Hover/focus feedback runs at about 50 ms.
- The crossroad shadow change stays.
- ⚠️ The **Instagram marquee keeps moving, slowed down to 120 s**. It is not stopped. If the rule is supposed to be "no motion at all", change `animation-duration: 120s` to `animation: none` in `main.scss`.

## Known limitations / TODOs

The `TODO(...)` comments currently in the code are listed below. Most of them come from values measured in `reference/*.png` screenshots because the Figma variables were not available.

**Design tokens: `tailwind.config.js`**
- [ ] Color tokens `secondary-border`, `accent-bg` (token name), `page`, `card`, `card-border`, `icon`, `icon-border`: verify against Figma
- [ ] Spacing scale (8/16/24/32/40/80) and its names are inferred
- [ ] Radii `radius-sm` (8px) / `radius-md` (12px)
- [ ] Font sizes, all measured from 1440px screenshots

**Styles: `src/styles/main.scss`**
- [ ] Crossroad card gradients: exact stops/angles (l. 144)
- [ ] Crossroad card spot colors (l. 218)
- [ ] Bento gradients: exact stops (l. 283)
- [ ] Scene → footer fade colors (l. 529)

**Header: `src/components/header.html`**
- [ ] Nav link targets, KIS link target, social profile URLs
- [ ] Mobile menu (`<details>`, no JS): no mobile design was provided

**Footer: `src/components/footer.html`**
- [ ] Top padding / navy fade from the section above
- [ ] Social profile URLs, link targets (2×), placeholder phone number
- [ ] **Replace the text stand-in with the real eSports logo**: no asset exists yet

**Hero: `src/components/homepage/hero.html`**
- [ ] Photo box position/size (measured)
- [ ] Link targets and article URLs
- [ ] Scroll-hint target section does not exist yet
- [ ] **Replace the scroll-hint arrow with a sprite icon**: no thin down-arrow in `src/icons/`
- [ ] Visually hidden heading (kept for screen readers): confirm
- [ ] **Real article images**: only `article-1.jpg` exists, reused for all 3 cards
- [ ] Slider arrows/dots are not in the design (hidden on desktop by Swiper's lock class)

**Gallery: `src/components/homepage/gallery.html`**
- [ ] Section padding
- [ ] **Real gallery photos**: `gallery-1..3` are cycled 4×

**Crossroad: `src/components/homepage/crossroad.html`**
- [ ] Section padding
- [ ] Cards use gradients only, no photos
- [ ] Card title weight: looks Regular in the design, but only Schibsted Grotesk Bold is self-hosted
- [ ] Card link targets

**Right now (bento): `src/components/homepage/right-now.html`**
- [ ] Section padding, link targets
- [ ] Results, member names and values are sample data (future live data source)
- [ ] Progress bars have no labels in the design, so their meaning is unknown (hidden from assistive tech)
- [ ] Year assumed to be 2026
- [ ] Name weight: Regular vs self-hosted Bold

**Instagram: `src/components/homepage/instagram.html`**
- [ ] Section padding; profile URL derived from the handle
- [ ] **Better alt text**: replace with real post captions

**Partners: `src/components/homepage/partners.html`**
- [ ] Section padding; uniform 196px cards vs 193–196px in Figma

**Not marked in code, but worth knowing**
- [ ] `src/icons/Group.svg` / `Group-1.svg` have generic Figma export names; rename them (and update their usages) once their purpose is clear
- [ ] Node version is not pinned (no `engines` / `.nvmrc`)
