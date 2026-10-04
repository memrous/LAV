// Category / year filters and tabs (articles, athletes, events, gallery). One module for every page, driven by data
// attributes only – no page-specific code. No-op on pages without [data-filter-group].
//
// Markup contract
//   [data-filter-group="<name>"]       group container: role="group" with pill buttons, or role="tablist" with tabs
//     data-filter-target="#a, #b"      item container(s) as a selector list; the first one is what the live region counts
//     data-filter-param="kategorie"    OPTIONAL: query-string param the active value is synced to (?kategorie=zavody)
//   button[data-filter-value="<slug>"] ASCII slug; "vse" shows everything. The button pressed in the markup is the default
//                                      (also the fallback for an unknown ?param value).
//   [data-filter-tags="<slug> <slug>"] filterable item inside a target; may carry several slugs
//   [data-filter-empty="<target id>"]  empty state of one item container, `hidden` in the markup
//   [data-filter-live="<group name>"]  live region; data-filter-forms="1|2–4|5+" Czech plural forms, # = count.
//                                      An empty region (visually hidden) only speaks after a click; one that already shows
//                                      text (a visible counter) is kept in sync from the start.
// Several groups may target the same container (gallery: category + year): an item shows only if every group matches it.
// Real tabs (role="tablist" + role="tab"): aria-selected, roving tabindex, ←/→/Home/End; a tab's aria-controls
// role="tabpanel" is shown, the other tabs' panels hidden.
//
// Shared visibility (also used by search.js): every filter group – and the article search – is a "source":
//   { items, targets, test(item) → bool, lives?, liveText?(live), afterRefresh?() }
// registered with registerSource(). An item is visible when EVERY source that contains it passes it; refresh() is the
// one place that applies that (hidden + fade-in), toggles the empty states of all targets and updates the live regions
// of the source that changed.
//
// Pagination (load-more.js) is the LAST stage of the same pipeline: a "pager" { list, items, pageSize, pages,
// afterRefresh?() } registered with registerPager() keeps only the first pageSize × pages of the list's items that
// passed every source; the rest get the same `hidden`. A source with showsAll() → true (the search while a query is
// active) lifts the limit for the lists it targets. Any source change that targets a paginated list resets it to page 1.

const ALL = 'vse';
const STAGGER = 30; // ms between items fading in, capped at 8 items
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const sources = new Set();
const pagers = new Set();
const groupsByName = new Map();

// forms = [1, 2–4, 5+], or [0, 1, 2–4, 5+] with a separate zero form; # = n.
export const pluralForm = (forms, n) => {
  if (forms.length === 4) return n === 0 ? forms[0].replace('#', n) : pluralForm(forms.slice(1), n);
  return forms[n === 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2].replace('#', n);
};

export function registerSource(source) {
  source.itemSet = new Set(source.items);
  sources.add(source);
}

export function registerPager(pager) {
  pagers.add(pager);
}

const inDocumentOrder = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

// changed: the source (or pager) whose state just changed (its live regions are updated); null = re-apply only.
// Returns the items that became visible (in document order).
export function refresh(changed, { animate = false, announce = false } = {}) {
  const all = [...sources];
  const items = new Set([...all, ...pagers].flatMap((source) => source.items));

  const visible = new Map();
  items.forEach((item) => visible.set(item, all.every((source) => !source.itemSet.has(item) || source.test(item))));

  pagers.forEach((pager) => {
    if (changed && changed !== pager && changed.targets?.includes(pager.list)) pager.pages = 1;
    pager.limited = !all.some((source) => source.showsAll?.() && source.targets.includes(pager.list));
    const matching = pager.items.filter((item) => visible.get(item)).sort(inDocumentOrder);
    const limit = pager.limited ? pager.pageSize * pager.pages : Infinity;
    matching.slice(limit).forEach((item) => visible.set(item, false));
    pager.total = matching.length;
    pager.shown = Math.min(limit, matching.length);
  });

  const shown = [];
  items.forEach((item) => {
    if (visible.get(item) && item.hidden) shown.push(item);
    item.hidden = !visible.get(item);
  });
  shown.sort(inDocumentOrder);

  new Set(all.flatMap((source) => source.targets)).forEach((target) => {
    const empty = target.id && document.querySelector(`[data-filter-empty="${target.id}"]`);
    if (empty) empty.hidden = [...items].some((item) => !item.hidden && target.contains(item));
  });

  if (animate && !reducedMotion.matches) {
    shown.forEach((item, i) =>
      item.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], {
        duration: 250,
        delay: Math.min(i, 8) * STAGGER,
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        fill: 'backwards',
      })
    );
  }

  changed?.lives?.forEach((live) => {
    if (!announce && !live.textContent.trim()) return;
    live.textContent = changed.liveText(live);
  });

  [...all, ...pagers].forEach((source) => source.afterRefresh?.());
  return shown;
}

function select(group, value) {
  group.value = value;
  group.buttons.forEach((button) => {
    const on = button.dataset.filterValue === value;
    if (group.isTabs) {
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      if (panel?.getAttribute('role') === 'tabpanel') panel.hidden = !on;
    } else {
      button.setAttribute('aria-pressed', String(on));
    }
  });
}

function syncUrl(group) {
  if (!group.param) return;
  const url = new URL(window.location.href);
  if (group.value === group.defaultValue) url.searchParams.delete(group.param);
  else url.searchParams.set(group.param, group.value);
  history.replaceState(history.state, '', url);
}

function activate(group, button) {
  if (button.dataset.filterValue === group.value) return;
  select(group, button.dataset.filterValue);
  refresh(group, { animate: true, announce: true });
  syncUrl(group);
}

// For other modules (search "Zrušit hledání" → category back to "Vše"). Unknown group / value: no-op.
export function setFilter(name, value) {
  const group = groupsByName.get(name);
  const button = group?.buttons.find((b) => b.dataset.filterValue === value);
  if (button) activate(group, button);
}

function onTabKeydown(group, event) {
  const i = group.buttons.indexOf(event.target);
  if (i < 0) return;
  const last = group.buttons.length - 1;
  const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  group.buttons[next].focus();
  activate(group, group.buttons[next]);
}

export function initFilters() {
  const params = new URLSearchParams(window.location.search);

  document.querySelectorAll('[data-filter-group]').forEach((el) => {
    if (!el.dataset.filterTarget) return; // incomplete markup: skip this group, keep the others working
    const isTabs = el.getAttribute('role') === 'tablist';
    const buttons = [...el.querySelectorAll('[data-filter-value]')];
    // In the order listed (not document order): the first target is the one the live region counts.
    const targets = el.dataset.filterTarget
      .split(',')
      .map((selector) => document.querySelector(selector.trim()))
      .filter(Boolean);
    if (!buttons.length || !targets.length) return;

    const pressed = buttons.find((b) => b.getAttribute(isTabs ? 'aria-selected' : 'aria-pressed') === 'true');
    const defaultValue = (pressed ?? buttons[0]).dataset.filterValue;
    const param = el.dataset.filterParam;
    const fromUrl = param && params.get(param);

    const group = {
      isTabs,
      buttons,
      targets,
      param,
      defaultValue,
      value: null,
      items: targets.flatMap((target) => [...target.querySelectorAll('[data-filter-tags]')]),
      lives: [...document.querySelectorAll(`[data-filter-live="${el.dataset.filterGroup}"]`)],
      test: (item) => group.value === ALL || item.dataset.filterTags.split(/\s+/).includes(group.value),
      liveText: (live) => {
        const count = [...targets[0].querySelectorAll('[data-filter-tags]')].filter((item) => !item.hidden).length;
        return pluralForm((live.dataset.filterForms || '#|#|#').split('|'), count);
      },
    };
    registerSource(group);
    groupsByName.set(el.dataset.filterGroup, group);

    select(group, buttons.some((b) => b.dataset.filterValue === fromUrl) ? fromUrl : defaultValue);
    refresh(group, { animate: false, announce: false });
    syncUrl(group); // drops an unknown ?param value from the address bar

    el.addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter-value]');
      if (button && el.contains(button)) activate(group, button);
    });
    if (isTabs) el.addEventListener('keydown', (event) => onTabKeydown(group, event));
  });
}
