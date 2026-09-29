import Swiper from 'swiper';
import { A11y, Keyboard, Navigation, Pagination } from 'swiper/modules';
import { FreeMode } from 'swiper/modules';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const heroArticles = document.querySelector('.js-hero-articles');

if (heroArticles) {
  new Swiper(heroArticles, {
    modules: [A11y, Keyboard, Navigation, Pagination],
    slidesPerView: 1.1,
    spaceBetween: 16,
    watchOverflow: true,
    keyboard: { enabled: true, onlyInViewport: true },
    navigation: {
      prevEl: '.js-hero-articles-prev',
      nextEl: '.js-hero-articles-next',
    },
    pagination: {
      el: '.js-hero-articles-pagination',
      clickable: true,
    },
    a11y: {
      prevSlideMessage: 'Předchozí článek',
      nextSlideMessage: 'Další článek',
      paginationBulletMessage: 'Přejít na článek {{index}}',
    },
    breakpoints: {
      640: { slidesPerView: 2, spaceBetween: 24 },
      1024: { slidesPerView: 3, spaceBetween: 24 },
    },
  });
}

// Gallery: free-drag row (mouse + touch, with momentum), no arrows/dots.
const gallery = document.querySelector('.js-gallery');

if (gallery) {
  new Swiper(gallery, {
    modules: [FreeMode],
    slidesPerView: 'auto',
    spaceBetween: 16,
    initialSlide: 1, // first photo peeks in from the left edge, like the design
    grabCursor: true,
    freeMode: { enabled: true, momentum: true, momentumRatio: 0.8 },
    breakpoints: {
      1024: { spaceBetween: 24 },
    },
  });
}

// Header Transparent → Light (spec: animace/01-hero-river.png): past 80 px of scroll the header gets a light
// background, backdrop blur and a hairline. Scroll events are coalesced to one check per frame and the class is
// only touched when the state actually changes. Transition timing (300 ms / reduced motion) lives in main.scss.
const HEADER_SCROLL_THRESHOLD = 80;
const siteHeader = document.querySelector('.js-site-header');

if (siteHeader) {
  let ticking = false;
  let scrolled = null;

  const update = () => {
    ticking = false;
    const next = window.scrollY > HEADER_SCROLL_THRESHOLD;
    if (next !== scrolled) {
      scrolled = next;
      siteHeader.classList.toggle('site-header--scrolled', next);
    }
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
  update(); // page may load already scrolled (anchor, reload, back navigation)
}

// Rozcestník grain drift: the 12 s loop only runs while a card is on screen (paused, not reset, when it leaves).
// Reduced motion is handled in CSS (animation: none), so toggling the class there is harmless.
const crossroadCards = document.querySelectorAll('.js-crossroad-card');

if (crossroadCards.length) {
  const driftObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle('is-drifting', entry.isIntersecting));
  });
  crossroadCards.forEach((card) => driftObserver.observe(card));
}

// "Aktuálně v akademii" bento (spec: animace/04-bento-widgets.png). One observer for all cards; each card reveals
// once at 20 % visibility. Cards entering in the same batch are staggered 80 ms (--reveal-delay, also used by the
// bars in CSS); the medal counts in the results card count up 0 → target (1.2 s ease-out-expo, 600 ms apart).
// Under reduced motion nothing is armed, so everything stays at its final state from the start (spec 08).
const rightNow = document.querySelector('.js-right-now');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (rightNow && !prefersReducedMotion && 'IntersectionObserver' in window) {
  const CARD_STAGGER = 80;
  const COUNT_DURATION = 1200;
  const COUNT_STAGGER = 600;
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

  const countUp = (el, delay) => {
    const target = Number(el.dataset.countTo);
    let start = null;
    const tick = (now) => {
      start ??= now + delay;
      const t = Math.max(0, (now - start) / COUNT_DURATION);
      el.textContent = String(Math.round(target * easeOutExpo(Math.min(t, 1))));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const counters = rightNow.querySelectorAll('[data-count-to]');
  counters.forEach((el) => (el.textContent = '0'));
  rightNow.classList.add('is-armed');

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry, i) => {
          const card = entry.target;
          const delay = i * CARD_STAGGER;
          observer.unobserve(card);
          card.style.setProperty('--reveal-delay', `${delay}ms`);
          card.classList.add('is-visible');
          card.querySelectorAll('[data-count-to]').forEach((el, j) => countUp(el, delay + j * COUNT_STAGGER));
        });
    },
    { threshold: 0.2 }
  );
  rightNow.querySelectorAll('.right-now-card').forEach((card) => revealObserver.observe(card));
}

// Footer "LAV" wordmark reveal (spec: animace/07-footer.png): the letters rise out from under a fixed crop line,
// 600 ms expo.out, once. The spec's "+40 px" is at mock scale (78 px letters there, 480 px here at 1440), so the
// frames' proportions are used instead, measured in the spec image: travel = 40/78 of the cap height, crop line
// 11/78 of the cap height below the baseline (≈37 % of the letters hidden at the start, as in the "Před" frame).
// clip-path is on the element itself (the glyphs fit its box); its bottom inset shrinks by exactly the travel, so the
// crop line stays put on screen while the letters move up through it.
// Trigger: once the final baseline (the crop line) is 10 % above the viewport bottom. ScrollTrigger measures the
// element in its offset start state, hence "bottom-=travel". clamp(): on viewports where that point lies past the
// end of the page it fires at the very bottom instead of never. Reduced motion / no JS: the wordmark just sits there.
const footerWordmark = document.querySelector('.js-footer-wordmark');

if (footerWordmark && !prefersReducedMotion) {
  const CAP_HEIGHT_PER_EM = 480 / 684; // Schibsted Grotesk Bold "LAV" ink height / font size (canvas measureText)
  const capHeight = () => parseFloat(getComputedStyle(footerWordmark).fontSize) * CAP_HEIGHT_PER_EM;
  const travel = () => Math.round((capHeight() * 40) / 78);
  const cropBelowBaseline = () => Math.round((capHeight() * 11) / 78);

  gsap.registerPlugin(ScrollTrigger);
  gsap.fromTo(
    footerWordmark,
    { y: travel, clipPath: () => `inset(-10% -10% ${travel() - cropBelowBaseline()}px -10%)` },
    {
      y: 0,
      clipPath: () => `inset(-10% -10% ${-cropBelowBaseline()}px -10%)`,
      duration: 0.6,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: footerWordmark,
        start: () => `clamp(bottom-=${travel()} 90%)`,
        once: true,
        invalidateOnRefresh: true, // re-measure travel/crop if the viewport (and so the font size) changes first
      },
      clearProps: 'transform,clipPath', // rest state = plain element, same as without JS
    }
  );
}
