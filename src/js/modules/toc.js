// "Obsah" scrollspy (O akademii, text page, Uchazeči – every page that includes components/about/aside.html).
// No-op on pages without [data-toc].
//
// Markup contract
//   [data-toc]                 container (the <nav>); every a[href^="#"] inside is an item, its hash = the target id
//   a[aria-current="true"]     the active item – the ONLY state; styles in _about.scss. Nothing is marked in the
//                              markup, so without JS no item is stuck active and the anchors work natively.
//
// Active item = the last target (in document order, not TOC order) whose top has passed a line HEADER + LINE_OFFSET
// below the viewport top; none passed (top of page) → the first target; scrolled to the very bottom → the last target
// (short last sections like "Dokumenty" never reach the line). The "passed" state comes from one IntersectionObserver
// whose root area is everything ABOVE that line (rootMargin: huge top margin, bottom margin cut at the line), so a
// target intersects ⇔ its top is above the line – also after big jumps (anchor, reload), where a thin band would miss it.
//
// Click: aria-current moves at once, the page smooth-scrolls (instant under reduced motion) and the scrollspy is locked
// until the scroll ends (scrollend, or 150 ms without scroll events where unsupported, capped at 3 s), so the indicator
// doesn't run through the sections in between. The hash is updated with replaceState (clicks only, never on scroll).

const LINE_OFFSET = 32; // px below the header; scroll-margin-top (6rem = header + 24) lands a clicked heading above it
const SCROLL_IDLE = 150; // ms without scroll events = scroll finished (fallback for browsers without scrollend)
const LOCK_CAP = 3000; // ms, the lock never outlives this
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const headerHeight = () => document.querySelector('.js-site-header')?.offsetHeight ?? 72;
const atBottom = () =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

function initToc(nav) {
  const items = [...nav.querySelectorAll('a[href^="#"]')]
    .map((link) => ({ link, target: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
    .filter((item) => item.target)
    // Document order: the TOC may list targets in a different order than the page (text page: Citace / Tabulka).
    .sort((a, b) => (a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  if (!items.length) return;

  const passed = new Set();
  let current = null;
  let locked = false;
  let releaseLock = null;
  let observer = null;
  let line = 0;

  const setActive = (item) => {
    if (item === current) return;
    current?.link.removeAttribute('aria-current');
    item.link.setAttribute('aria-current', 'true');
    current = item;
  };

  const update = () => {
    if (locked) return;
    if (atBottom()) return setActive(items[items.length - 1]);
    const last = items.findLast((item) => passed.has(item.target));
    setActive(last ?? items[0]);
  };

  // The same test as the observer, read synchronously: when the lock is released the observer may not have delivered
  // the final positions yet (it reports a frame later), and the stale set would flash the previous item.
  const measure = () =>
    items.forEach(({ target }) =>
      target.getBoundingClientRect().top < line ? passed.add(target) : passed.delete(target)
    );

  const observe = () => {
    observer?.disconnect();
    passed.clear();
    line = headerHeight() + LINE_OFFSET;
    const above = document.documentElement.scrollHeight + window.innerHeight; // root reaches past the page top
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? passed.add(entry.target) : passed.delete(entry.target)));
        update();
      },
      { rootMargin: `${above}px 0px ${line - window.innerHeight}px 0px` }
    );
    items.forEach((item) => observer.observe(item.target));
  };

  // Lock the scrollspy until the scroll settles. onDone runs after release (click: re-sync if the user interrupted).
  const lock = (onDone) => {
    releaseLock?.();
    locked = true;
    const startY = window.scrollY;
    let idle = setTimeout(() => release(), SCROLL_IDLE * 2); // nothing to scroll (already there) → no events at all
    const cap = setTimeout(() => release(), LOCK_CAP);
    const onScroll = () => {
      clearTimeout(idle);
      idle = setTimeout(() => release(), SCROLL_IDLE);
    };
    // Chrome may fire scroll + scrollend right after scrollIntoView() starts, before anything has moved (seen when
    // starting from the bottom of the page) – a scrollend counts only once the page has actually moved.
    const onScrollEnd = () => Math.abs(window.scrollY - startY) > 1 && release();
    const release = (silent = false) => {
      clearTimeout(idle);
      clearTimeout(cap);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', onScrollEnd);
      locked = false;
      releaseLock = null;
      if (silent) return;
      measure();
      onDone?.();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', onScrollEnd);
    releaseLock = () => release(true);
  };

  nav.addEventListener('click', (event) => {
    const item = items.find(({ link }) => link === event.target.closest('a'));
    if (!item || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();

    setActive(item);
    lock(update);

    // Like a native anchor jump, the next Tab continues from the section; tabindex="-1" makes a heading focusable
    // (no outline, _about.scss). Focus first (without scrolling), then scroll – focus would cancel a smooth scroll.
    const { target } = item;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.dataset.tocTarget = '';
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });

    history.replaceState(history.state, '', `#${target.id}`);
  });

  // Bottom of the page isn't an intersection change: one check per frame while scrolling.
  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    },
    { passive: true }
  );

  // The root margins depend on the viewport and header height.
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(observe);
  });

  // Loaded with a hash (#historie): that item, held while the browser jumps / restores the scroll position.
  const fromHash = window.location.hash && items.find(({ target }) => `#${target.id}` === decodeURIComponent(window.location.hash));
  if (fromHash) {
    setActive(fromHash);
    lock();
  } else {
    setActive(items[0]); // until the observer's first callback
  }
  observe();
}

export function initTocs() {
  document.querySelectorAll('[data-toc]').forEach(initToc);
}
