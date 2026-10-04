// "Načíst další" – client-side pagination of a list (articles grid, gallery albums). No-op without [data-load-more].
// Pagination is the last stage of the shared visibility pipeline in filters.js (registerPager): of the items that pass
// every filter / the search, only the first pageSize × pages are shown; the rest get the same `hidden` attribute.
// Filter or search changes reset the list to page 1 (filters.js); an active search query shows every match and this
// button is hidden.
//
// Markup contract
//   #<list>[data-page-size="6"]           the list; its element children are the items. No data-page-size = no paging.
//   button[data-load-more]                 aria-controls="<list id>"; hidden whenever nothing more can be loaded
//     data-load-more-forms="1|2–4|5+"      announcement after a load, # = count ("Načteno dalších # článků")
//     data-load-more-done="…"              appended once everything is shown ("Zobrazeny všechny články")
//     data-load-more-param="strana"        OPTIONAL query-string param for the page count (default "strana"; dropped at 1)
//   [data-load-more-live="<list id>"]      live region (visually hidden)
// Without JS the button is hidden (CSS, _articles.scss) and every item is visible.

import { pluralForm, refresh, registerPager } from './filters.js';

// The one step that "gets the next items". Today they are already in the DOM, hidden by pagination, so the next page
// is just one more page in the count. Later this becomes a fetch from the CMS API (next page for the current
// category / year / query), appending the returned cards to pager.list and pager.items – the rest of the module
// (refresh, reveal, focus, announcement, URL) stays as it is.
async function loadNextPage(pager) {
  pager.pages += 1;
}

function setup(button) {
  const list = document.getElementById(button.getAttribute('aria-controls') || '');
  const pageSize = Number(list?.dataset.pageSize);
  if (!list || !(pageSize > 0)) return;

  const live = document.querySelector(`[data-load-more-live="${list.id}"]`);
  const param = button.dataset.loadMoreParam || 'strana';

  const syncUrl = () => {
    const url = new URL(window.location.href);
    if (pager.pages > 1) url.searchParams.set(param, String(pager.pages));
    else url.searchParams.delete(param);
    history.replaceState(history.state, '', url);
  };

  const pager = {
    list,
    items: [...list.children],
    pageSize,
    pages: 1,
    afterRefresh() {
      // Nothing beyond the last page: a ?strana= larger than the list (or than a filtered category) is clamped.
      if (this.limited) this.pages = Math.max(1, Math.min(this.pages, Math.ceil(this.total / pageSize)));
      button.hidden = !(this.limited && this.total > this.shown);
      // Back on page 1 (filter / search change): the last "Načteno dalších…" no longer describes the list.
      if (this.pages === 1 && live) live.textContent = '';
      syncUrl();
    },
  };
  registerPager(pager);

  // Re-setting identical text isn't re-read by screen readers: clear first, write on the next frame.
  const announce = (text) => {
    if (!live) return;
    live.textContent = '';
    requestAnimationFrame(() => (live.textContent = text));
  };

  button.addEventListener('click', async () => {
    await loadNextPage(pager);
    const revealed = refresh(pager, { animate: true }).filter((item) => list.contains(item));
    if (!revealed.length) return;

    let text = pluralForm((button.dataset.loadMoreForms || '#|#|#').split('|'), revealed.length);
    if (button.hidden && button.dataset.loadMoreDone) text += `. ${button.dataset.loadMoreDone}`;
    announce(text);

    // Keyboard / screen-reader users continue from the first new item (the button may be gone now). Focus scrolls
    // only as far as the browser needs to bring the link into view.
    revealed[0].querySelector('a[href], button')?.focus();
  });

  const fromUrl = Number.parseInt(new URLSearchParams(window.location.search).get(param), 10);
  if (fromUrl > 1) pager.pages = fromUrl;
  refresh(null);
}

export function initLoadMore() {
  document.querySelectorAll('button[data-load-more]').forEach(setup);
}
