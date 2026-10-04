// Click-to-load third-party embeds (contact map, about / text page video). No-op without [data-embed].
// Nothing is requested from the third party until the visitor clicks: the placeholder is a local image + a button, and
// the <iframe> is only created on click (nothing is remembered between visits).
//
// Markup contract (container = the box that keeps the size; give it the aspect ratio, e.g. aspect-[628/520])
//   [data-embed]                         container; becomes focusable (tabindex="-1") once the embed has loaded
//     data-embed-src="https://…"         iframe URL (https only)
//     data-embed-title="…"               iframe title (its accessible name)
//     data-embed-allow="…"               OPTIONAL iframe allow attribute (video: "autoplay; fullscreen; picture-in-picture")
//     data-embed-allowfullscreen         OPTIONAL
//     data-embed-loading="Načítám…"      OPTIONAL button text while loading
//     data-embed-loaded="Mapa načtena"   OPTIONAL announcement after loading
//     data-embed-error="…"               OPTIONAL message when the embed doesn't load in time
//   [data-embed-load]                    the <button type="button"> that loads it (hidden without JS, _embed.scss); a text
//                                        button shows the loading text, one with an aria-label gets it there instead
//   [data-embed-placeholder]             everything removed once the embed has loaded (image, caption, overlay)
//   [data-embed-status]                  visually hidden live region for the announcement
// Styles: _embed.scss (.embed, .embed__overlay, .embed__frame …).

const TIMEOUT = 15000; // ms without a load event → error message, button usable again

function load(container, button) {
  if (container.querySelector('.embed__frame')) return;
  let url;
  try {
    url = new URL(container.dataset.embedSrc, window.location.href);
  } catch {
    return; // malformed data-embed-src: the button does nothing, the page's own link still works
  }
  if (url.protocol !== 'https:') return;

  // A button named by its text ("Zobrazit interaktivní mapu") shows the loading text; one named by aria-label (the
  // video's play button, whose visible content is decorative) gets it as its aria-label – its markup stays intact.
  const named = button.hasAttribute('aria-label');
  const setLabel = (text) => (named ? button.setAttribute('aria-label', text) : (button.textContent = text));
  const label = named ? button.getAttribute('aria-label') : button.textContent;
  button.setAttribute('aria-disabled', 'true');
  button.classList.add('is-loading');
  setLabel(container.dataset.embedLoading || 'Načítám…');

  const frame = document.createElement('iframe');
  frame.className = 'embed__frame';
  frame.src = url.href;
  frame.title = container.dataset.embedTitle || '';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer-when-downgrade';
  if (container.dataset.embedAllow) frame.allow = container.dataset.embedAllow;
  if (container.hasAttribute('data-embed-allowfullscreen')) frame.allowFullscreen = true;

  const timer = setTimeout(() => {
    frame.remove();
    button.removeAttribute('aria-disabled');
    button.classList.remove('is-loading');
    setLabel(label);
    const status = container.querySelector('[data-embed-status]');
    if (status) status.textContent = container.dataset.embedError || 'Obsah se nepodařilo načíst.';
  }, TIMEOUT);

  frame.addEventListener(
    'load',
    () => {
      clearTimeout(timer);
      container.classList.add('is-loaded');
      container.querySelectorAll('[data-embed-placeholder]').forEach((el) => el.remove());
      // The button is gone: keyboard / screen-reader users continue from the embed's box, which announces itself.
      container.tabIndex = -1;
      container.focus({ preventScroll: true });
      const status = container.querySelector('[data-embed-status]');
      if (status) status.textContent = container.dataset.embedLoaded || '';
    },
    { once: true }
  );

  // Under the placeholder (it stays visible with the loading state until the frame has loaded): same box, no shift.
  container.prepend(frame);
}

export function initEmbeds() {
  document.querySelectorAll('[data-embed]').forEach((container) => {
    const button = container.querySelector('[data-embed-load]');
    if (!button || !container.dataset.embedSrc) return;
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') load(container, button);
    });
  });
}
