// Photo lightbox (athlete detail, article detail, homepage "Ze života akademie"). No-op without [data-lightbox].
//
// Markup contract
//   a[data-lightbox="<group>"][href="<full image>"]   one tile; tiles of one group form one gallery (groups never mix)
//     data-lightbox-set="<key>"                     OPTIONAL: the tile opens a whole photo set instead (gallery.html
//                                                   album card → the album's photos), from the page's
//                                                   <script type="application/json" data-lightbox-sets>
//                                                   { "<key>": [{ "src", "alt", "caption"?, "srcset"? }, …] }.
//                                                   Unknown key / no JSON: the click is left to the link.
//     data-lightbox-srcset="…"                      OPTIONAL responsive full image (sizes = the space it gets)
//     img[alt]                                      alt of the enlarged photo; caption = the tile's figcaption text,
//                                                   otherwise this alt
// Without JS the links simply open the full image.
//
// Behaviour: one native <dialog> (showModal: focus trap, inert page, Escape) built on first use. The gallery = the
// group's tiles that are VISIBLE right now (not inside [hidden] from filters / load-more), in DOM order. Stops at the
// ends (no wrap-around; the counter says where you are). ←/→, buttons, horizontal swipe; ×, Escape or a click outside
// the photo closes and focus returns to the tile. 150 ms fades (none under reduced motion); neighbours are preloaded.

const FADE = 150; // ms, keep in sync with _lightbox.scss
const SWIPE_MIN = 50; // px horizontally, and clearly more horizontal than vertical
const LOADING_DELAY = 200; // ms before the spinner shows (cached photos never flash it)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const SVG_NS = 'http://www.w3.org/2000/svg';
const icon = (name, flip = false) => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `lightbox__icon${flip ? ' lightbox__icon--flip' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#sprite-${name}`);
  svg.append(use);
  return svg;
};

const el = (tag, className, attrs = {}) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};

const isVisible = (tile) => !tile.closest('[hidden]') && (tile.checkVisibility?.() ?? true);

const photoOf = (tile) => {
  const img = tile.querySelector('img');
  const caption = tile.closest('figure')?.querySelector('figcaption')?.textContent.trim();
  return {
    src: tile.getAttribute('href'),
    srcset: tile.dataset.lightboxSrcset || '',
    alt: img?.getAttribute('alt') ?? '',
    caption: caption || img?.getAttribute('alt') || '',
  };
};

let ui = null; // built on first open
let photos = []; // current gallery: { src, srcset, alt, caption }
let index = 0;
let opener = null;
let token = 0; // latest requested photo; stale loads are ignored
let restoringFocus = false;

function build() {
  const dialog = el('dialog', 'lightbox', { 'aria-label': 'Fotogalerie', 'aria-describedby': 'lightbox-caption' });

  const close = el('button', 'lightbox__btn lightbox__close', { type: 'button', 'aria-label': 'Zavřít' });
  close.append(icon('close'));
  const prev = el('button', 'lightbox__btn lightbox__nav lightbox__nav--prev', { type: 'button', 'aria-label': 'Předchozí fotka' });
  prev.append(icon('chevron-right', true));
  const next = el('button', 'lightbox__btn lightbox__nav lightbox__nav--next', { type: 'button', 'aria-label': 'Další fotka' });
  next.append(icon('chevron-right'));

  // Visible "3 / 8"; screen readers get "Fotka 3 z 8: <caption>" on every change.
  const counter = el('p', 'lightbox__counter', { 'aria-live': 'polite' });
  const counterVisible = el('span', '', { 'aria-hidden': 'true' });
  const counterSpoken = el('span', 'sr-only');
  counter.append(counterVisible, counterSpoken);

  const stage = el('div', 'lightbox__stage');
  const figure = el('figure', 'lightbox__figure');
  const img = el('img', 'lightbox__img', { alt: '', decoding: 'async' });
  const status = el('p', 'lightbox__status', { hidden: '' });
  const caption = el('figcaption', 'lightbox__caption', { id: 'lightbox-caption' });
  figure.append(img, caption);
  stage.append(figure, status);

  // DOM order = Tab order: close, previous, next (showModal focuses the close button first).
  dialog.append(close, counter, stage, prev, next);
  document.body.append(dialog);

  close.addEventListener('click', hide);
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    }
  });
  // Escape: animate out instead of the native instant close.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    hide();
  });
  dialog.addEventListener('close', afterClose);

  // Swipe (touch / pen): horizontal and long enough; a vertical drag or a tap does nothing.
  let start = null;
  let swiped = false;
  stage.addEventListener('pointerdown', (event) => {
    swiped = false;
    start = event.pointerType === 'mouse' ? null : { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointerup', (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true;
      go(dx < 0 ? 1 : -1);
    }
  });
  stage.addEventListener('pointercancel', () => (start = null));

  // Click outside the photo (the dark area – the dialog fills the viewport, so that's the dialog / stage itself).
  dialog.addEventListener('click', (event) => {
    if (swiped) {
      swiped = false;
      return;
    }
    if (event.target === dialog || event.target === stage || event.target === figure) hide();
  });

  return { dialog, close, prev, next, counterVisible, counterSpoken, img, status, caption };
}

function preload(i) {
  const photo = photos[i];
  if (!photo) return;
  const { src, srcset } = photo;
  const image = new Image();
  if (srcset) {
    image.sizes = '100vw';
    image.srcset = srcset;
  }
  image.src = src;
}

function show(i, { fade = true } = {}) {
  index = i;
  const current = ++token;
  const photo = photos[i];
  const { img, status, caption, prev, next, counterVisible, counterSpoken } = ui;

  counterVisible.textContent = `${i + 1} / ${photos.length}`;
  counterSpoken.textContent = `Fotka ${i + 1} z ${photos.length}: ${photo.caption}`;
  caption.textContent = photo.caption;

  // At the ends the button stays focusable but does nothing (aria-disabled, not disabled): a real `disabled` would drop
  // focus, and handing it to the other button made a held Enter walk back through the gallery.
  prev.hidden = next.hidden = photos.length < 2;
  prev.setAttribute('aria-disabled', String(i === 0));
  next.setAttribute('aria-disabled', String(i === photos.length - 1));

  status.hidden = true;
  if (fade && !reducedMotion.matches) img.classList.add('is-fading');
  const spinner = setTimeout(() => {
    if (current !== token) return;
    status.textContent = 'Načítám fotku…';
    status.classList.add('is-loading');
    status.hidden = false;
  }, LOADING_DELAY);

  const loader = new Image();
  if (photo.srcset) {
    loader.sizes = '100vw';
    loader.srcset = photo.srcset;
  }
  loader.src = photo.src;
  loader
    .decode()
    .then(() => {
      if (current !== token) return;
      clearTimeout(spinner);
      img.hidden = false;
      img.srcset = photo.srcset;
      img.sizes = photo.srcset ? '100vw' : '';
      img.src = photo.src;
      img.alt = photo.alt;
      status.hidden = true;
      status.classList.remove('is-loading');
      requestAnimationFrame(() => img.classList.remove('is-fading'));
    })
    .catch(() => {
      if (current !== token) return;
      clearTimeout(spinner);
      img.hidden = true;
      img.removeAttribute('src');
      img.removeAttribute('srcset');
      img.alt = '';
      status.classList.remove('is-loading');
      status.textContent = 'Fotku se nepodařilo načíst.';
      status.hidden = false;
    });

  preload(i + 1);
  preload(i - 1);
}

function go(step) {
  const target = index + step;
  if (!ui?.dialog.open || target < 0 || target >= photos.length) return;
  show(target);
}

// Page scroll lock: overflow hidden on <html>; the scrollbar's space is kept (scrollbar-gutter) so nothing shifts.
function lockScroll(lock) {
  const root = document.documentElement;
  if (lock) {
    root.classList.toggle('lightbox-gutter', window.innerWidth > root.clientWidth);
    root.classList.add('lightbox-lock');
  } else {
    root.classList.remove('lightbox-lock', 'lightbox-gutter');
  }
}

// Photo set of a tile with data-lightbox-set (album), or null when there is none / the JSON is missing or broken.
let sets;
function setOf(tile) {
  const key = tile.dataset.lightboxSet;
  if (!key) return null;
  if (sets === undefined) {
    try {
      sets = JSON.parse(document.querySelector('script[data-lightbox-sets]')?.textContent || 'null');
    } catch {
      sets = null;
    }
  }
  const list = Array.isArray(sets?.[key]) ? sets[key].filter((p) => p?.src) : [];
  return list.length
    ? list.map((p) => ({ src: p.src, srcset: p.srcset || '', alt: p.alt || '', caption: p.caption || p.alt || '' }))
    : null;
}

function open(tile) {
  ui ??= build();
  let start = 0;
  const set = setOf(tile);
  if (set) {
    photos = set;
  } else {
    const tiles = [...document.querySelectorAll(`[data-lightbox="${CSS.escape(tile.dataset.lightbox)}"]`)].filter(isVisible);
    photos = tiles.map(photoOf);
    start = Math.max(0, tiles.indexOf(tile));
  }
  // An album is named after itself ("Fotogalerie: MČR juniorů, Račice"); loose photos are just "Fotogalerie".
  ui.dialog.setAttribute('aria-label', set ? `Fotogalerie: ${tile.textContent.trim()}` : 'Fotogalerie');
  opener = tile;
  lockScroll(true);
  ui.dialog.classList.remove('is-closing');
  show(start, { fade: false });
  ui.dialog.showModal();
}

function hide() {
  const { dialog } = ui;
  if (!dialog.open || dialog.classList.contains('is-closing')) return;
  if (reducedMotion.matches) return dialog.close();
  dialog.classList.add('is-closing');
  setTimeout(() => dialog.close(), FADE);
}

function afterClose() {
  ui.dialog.classList.remove('is-closing');
  token++; // drop a pending load
  lockScroll(false);
  restoringFocus = true;
  opener?.focus({ preventScroll: true });
  restoringFocus = false;
  opener = null;
}

// Tiles inside a Swiper carousel (homepage): Tab to a slide outside the visible strip would make the browser scroll the
// clipping section sideways (the carousel moves by transform, the section has overflow: hidden). Undo that scroll and
// let Swiper bring the slide in instead. Swiper keeps its instance on the element (el.swiper).
function keepCarouselInPlace(event) {
  if (restoringFocus) return; // focus back from the lightbox: leave the carousel where the user left it
  const tile = event.target.closest?.('a[data-lightbox]');
  const carousel = tile?.closest('.swiper');
  if (!carousel?.swiper) return;
  for (let node = carousel; node && node !== document.body; node = node.parentElement) node.scrollLeft = 0;
  // Only when the slide is (partly) off screen.
  const slide = tile.closest('.swiper-slide');
  const { left, right } = slide.getBoundingClientRect();
  if (left >= 0 && right <= document.documentElement.clientWidth) return;
  carousel.swiper.slideTo(carousel.swiper.slides.indexOf(slide), reducedMotion.matches ? 0 : 300);
}

export function initLightbox() {
  if (!document.querySelector('[data-lightbox]')) return;
  document.addEventListener('focusin', keepCarouselInPlace);
  document.addEventListener('click', (event) => {
    const tile = event.target.closest('a[data-lightbox]');
    // defaultPrevented: Swiper cancels the click that ends a drag (homepage carousel). Modified clicks keep the link.
    if (!tile || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (tile.dataset.lightboxSet && !setOf(tile)) return; // no photos for this album: the link (album page) works
    event.preventDefault();
    open(tile);
  });
}
