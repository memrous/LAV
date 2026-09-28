import Swiper from 'swiper';
import { A11y, Keyboard, Navigation, Pagination } from 'swiper/modules';
import { FreeMode } from 'swiper/modules';

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
