// Live search (articles page; album search on the gallery page). No-op on pages without [data-search].
// Filters through the shared visibility in filters.js: the search is one more "source", so an item is visible only when
// its category / year filter AND the query pass it.
//
// Markup contract
//   input[data-search]                   the search field (inside role="search", no <form>)
//     data-search-target="#a, #b"        containers searched; items = [data-search-text] inside (or the container itself,
//                                        e.g. the featured section)
//     data-search-filter="<group name>"  OPTIONAL: filter group "Zrušit hledání" resets to "vse"
//   [data-search-text="…"]               item; searched text = its [data-search-title] (read from the DOM, highlighted)
//                                        + this attribute (perex; the CMS fills it later, full text will be server-side)
//   [data-search-clear]                  × button in the same role="search" box, shown while the field has a value
//   [data-search-live="<input id>"]      live region; data-search-forms="0|1|2–4|5+" (# = count)
//   [data-search-empty="<input id>"]     "nothing found" state (hidden), with [data-search-empty-query] and
//                                        [data-search-reset]
// The live region and empty state are tied to their input by its id, so a page may have several searches.
//
// Query: trimmed, whitespace collapsed, lowercased, Czech diacritics stripped (NFD + combining marks removed) – the same
// for the item text. Every word must occur (AND), anywhere in title or perex, also as part of a word ("prim" →
// "Primátorkách"). Shorter than 2 characters = no filtering. Synced to ?q= (replaceState).

import { pluralForm, refresh, registerSource, setFilter } from './filters.js';

const MIN_LENGTH = 2;
const DEBOUNCE = 150;

const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const clean = (text) => text.trim().replace(/\s+/g, ' ');

// Folded text + for every folded character the index of the original character it came from, so match positions in
// the folded title map back to the displayed title.
function foldWithMap(text) {
  let folded = '';
  const map = [];
  let i = 0;
  for (const char of text) {
    const f = fold(char);
    folded += f;
    for (let k = 0; k < f.length; k++) map.push(i);
    i += char.length;
  }
  map.push(text.length);
  return { folded, map };
}

// Title → text nodes + <mark> for the matched ranges. DOM APIs only; the query never becomes markup.
function highlight(item, words) {
  const { title, titleText, titleFold } = item;
  if (!title) return;
  const ranges = [];
  words.forEach((word) => {
    for (let at = titleFold.folded.indexOf(word); at !== -1; at = titleFold.folded.indexOf(word, at + 1)) {
      ranges.push([titleFold.map[at], titleFold.map[at + word.length]]);
    }
  });
  if (!ranges.length) return unhighlight(item);

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  ranges.slice(1).forEach(([start, end]) => {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  });

  const parts = [];
  let pos = 0;
  merged.forEach(([start, end]) => {
    if (start > pos) parts.push(document.createTextNode(titleText.slice(pos, start)));
    const mark = document.createElement('mark');
    mark.className = 'search-mark';
    mark.textContent = titleText.slice(start, end);
    parts.push(mark);
    pos = end;
  });
  if (pos < titleText.length) parts.push(document.createTextNode(titleText.slice(pos)));
  title.replaceChildren(...parts);
  item.highlighted = true;
}

function unhighlight(item) {
  if (!item.highlighted) return;
  item.title.textContent = item.titleText;
  item.highlighted = false;
}

function setup(input) {
  if (!input.dataset.searchTarget) return;
  const targets = input.dataset.searchTarget
    .split(',')
    .map((selector) => document.querySelector(selector.trim()))
    .filter(Boolean);
  const elements = targets.flatMap((target) =>
    target.matches('[data-search-text]') ? [target] : [...target.querySelectorAll('[data-search-text]')]
  );
  if (!elements.length) return;

  const items = new Map(
    elements.map((el) => {
      const title = el.querySelector('[data-search-title]');
      const titleText = title?.textContent ?? '';
      const titleFold = foldWithMap(titleText);
      return [el, { title, titleText, titleFold, haystack: `${titleFold.folded}\n${fold(el.dataset.searchText)}` }];
    })
  );

  const clearButton = input.closest('[role="search"]')?.querySelector('[data-search-clear]');
  const live = input.id ? document.querySelector(`[data-search-live="${CSS.escape(input.id)}"]`) : null;
  const empty = input.id ? document.querySelector(`[data-search-empty="${CSS.escape(input.id)}"]`) : null;
  const emptyQuery = empty?.querySelector('[data-search-empty-query]');

  let query = ''; // cleaned display query
  let words = []; // folded words; empty = no filtering

  const source = {
    items: elements,
    targets,
    test: (el) => words.every((word) => items.get(el).haystack.includes(word)),
    showsAll: () => words.length > 0, // active query → every match, no pagination (filters.js / load-more.js)
    lives: live ? [live] : [],
    liveText: () => {
      if (!words.length) return '';
      const count = elements.filter((el) => !el.hidden).length;
      return pluralForm((live.dataset.searchForms || '#|#|#').split('|'), count);
    },
    afterRefresh: () => {
      const found = elements.some((el) => !el.hidden);
      if (empty) {
        empty.hidden = !words.length || found;
        if (emptyQuery) emptyQuery.textContent = query; // text, never HTML
      }
      // While searching, the per-list "V této kategorii…" states would be misleading (and doubled when nothing at all
      // is found): an empty list just shows nothing, the search's own empty state covers "no results".
      if (words.length) {
        targets.forEach((target) => {
          const listEmpty = target.id && document.querySelector(`[data-filter-empty="${target.id}"]`);
          if (listEmpty) listEmpty.hidden = true;
        });
      }
      items.forEach((item, el) => (words.length && !el.hidden ? highlight(item, words) : unhighlight(item)));
    },
  };
  registerSource(source);

  const syncUrl = () => {
    const url = new URL(window.location.href);
    if (words.length) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    history.replaceState(history.state, '', url);
  };

  const apply = ({ animate = true, announce = true, sync = true } = {}) => {
    const next = clean(input.value);
    const nextWords = next.length >= MIN_LENGTH ? fold(next).split(' ') : [];
    if (clearButton) clearButton.hidden = !input.value;
    if (next === query && nextWords.join(' ') === words.join(' ')) return;
    const wasActive = words.length > 0;
    query = next;
    words = nextWords;
    // Clearing: silence the region (an empty string isn't read out) instead of announcing the full count.
    if (!words.length && wasActive && live) live.textContent = '';
    refresh(source, { animate, announce: announce && words.length > 0 });
    if (sync) syncUrl();
  };

  let timer = 0;
  const applySoon = () => {
    clearTimeout(timer);
    if (clearButton) clearButton.hidden = !input.value;
    timer = setTimeout(apply, DEBOUNCE);
  };
  const applyNow = () => {
    clearTimeout(timer);
    apply();
  };
  const clear = () => {
    input.value = '';
    applyNow();
  };

  input.addEventListener('input', applySoon);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // never submits (no form today; also safe if one is added)
      applyNow();
    } else if (event.key === 'Escape' && input.value) {
      event.preventDefault();
      clear();
    }
  });
  clearButton?.addEventListener('click', () => {
    clear();
    input.focus();
  });
  empty?.querySelector('[data-search-reset]')?.addEventListener('click', () => {
    if (input.dataset.searchFilter) setFilter(input.dataset.searchFilter, 'vse');
    clear();
    input.focus();
  });

  // ?q= on load: prefill and apply silently (like the filters' ?kategorie=).
  const fromUrl = new URLSearchParams(window.location.search).get('q');
  if (fromUrl) input.value = fromUrl;
  apply({ animate: false, announce: false, sync: Boolean(fromUrl) });
}

export function initSearch() {
  document.querySelectorAll('input[data-search]').forEach(setup);
}
