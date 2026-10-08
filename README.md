# LAV – Labská akademie veslování

## O projektu

Statický front-endový prototyp webu Labské akademie veslování: HTML partialy přes `gulp-file-include` (`@@include`), Tailwind CSS 3 + SCSS, JavaScript bundlovaný Parcelem. Cílem je převést ho na šablony CMS napojené na API a administraci.

Design: [Figma – LAV](https://www.figma.com/design/MHeGwzFJEEkvUqwJjIlFkl/). Exporty z designu nejsou v repozitáři.

## Spuštění

Node verze není pinovaná (`.nvmrc` neexistuje), projekt se vyvíjí na Node 22.17.0.

```bash
npm install
npm run dev     # build do dist/ + browser-sync s live reloadem (URL vypíše do konzole, obvykle http://localhost:3000)
npm run build   # produkční build do dist/ (minifikované CSS a JS, optimalizované obrázky)
```

Výstup jde do `dist/` (není v gitu). HTML v `dist/` se záměrně neminifikuje: je to čitelný referenční prototyp.

## Struktura

```
src/
├── *.html            12 stránek (index, articles, article-detail, athletes, athlete-detail, about,
│                     applicants, events, gallery, partners, contact, text)
├── components/       partialy: v kořeni sdílené (header, footer, page-head, breadcrumb, cta-nabor, icon, sprite),
│                     v podsložkách stránkové (homepage/, articles/, athletes/, events/, gallery/ …)
├── styles/           main.scss (vstup) + _<stránka>.scss a sdílené _rich-text, _embed, _lightbox, _cta
├── js/               *.parcel.js = vstupy pro Parcel (main.parcel.js na všech stránkách, hero.parcel.js na úvodní)
│   └── modules/      filters, search, load-more, lightbox, embed, toc
├── img/              scene/ a footer-bg.jpg = grafika designu; ostatní fotky a logo-*.png = ukázková data
├── icons/            zdrojová SVG pro sprite ikon (<use href="#sprite-název">)
└── fonts/            self-hosted woff2
```

Sdílené partialy leží v kořeni `components/`. Stránkový partial potřebný jinde se includuje z původní složky, nekopíruje se (např. `articles/article-card.html` v detailu článku).

## Napojení na CMS

- **Ukázkové fotky:** všechno v `src/img/` kromě `scene/` a `footer-bg.jpg` jsou placeholdery (kořen, `about/`, `applicants/`, `contact/`, `gallery/`, `text/`, `logo-*.png`). Nahradí je uploady z CMS. Rozměry jsou v atributech `width`/`height` v markupu.
- **Bloky DEMO:** `<!-- DEMO: replace with CMS data -->` … `<!-- /DEMO -->` označují ukázkový obsah, který nahradí data z CMS. Ukázková jsou i ostatní data v partialech (texty, jména, výsledky).
- **Rich text:** výstup WYSIWYG editoru patří **bez tříd** do `<div class="rich-text">`. Podporované prvky a pravidla jsou popsané v hlavičce `src/styles/_rich-text.scss`. Testovací stránka všech prvků je `text.html`.
- **JavaScript** čte `data-*` atributy (filtry, hledání, „Načíst další“, lightbox, obsah stránky, embedy). Kontrakt markupu je v komentáři na začátku každého modulu v `src/js/modules/`. Každý modul bez svých elementů nic nedělá a `main.parcel.js` ho spouští ve vlastním `try/catch`. Bez JS je obsah vidět celý (CSS skrývá ovládání přes `html:not(.js)`).
- **Parametry partialů** (budoucí proměnné šablon) jsou popsané v komentáři na začátku každého partialu, který je přijímá (např. `components/page-head.html`, `components/articles/article-card.html`).
- **Načíst další:** API fetch má nahradit funkce `loadNextPage(pager)` v `src/js/modules/load-more.js`.
- **URL parametry** filtrů a hledání (`?kategorie=`, `?rok=`, `?q=`, `?strana=`) by měl umět vyrenderovat i server. Fulltext v tělech článků patří na server (klientské hledání prochází jen titulek a `data-search-text`).
- **Formuláře:** v prototypu žádný `<form>` není. Cíl nebo handler potřebují tlačítka s `href="#"`: „Vyplnit přihlášku“ (`components/applicants/apply.html`) a „Kontaktovat nás“ (`components/partners/become-partner.html`).
- **Embedy** (mapa, YouTube) se načítají až po kliknutí. URL je v `data-embed-src` v `components/contact/location.html` a `components/about/video.html`.
