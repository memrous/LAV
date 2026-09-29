// Hero motion (spec: animace/01-hero-river.png, reduced motion: animace/08-reduced-motion.png).
//   1. Water: WebGL shader "LAV · Labe river" over the static photo, parallax 0.3 × scroll, continuous.
//   2. Title reveal: words slide up from under a mask, 700 ms total, 60 ms stagger, expo.out.
// Loaded by components/hero.html as its own Parcel entry, so it travels with the hero partial.
// three.js is imported lazily: reduced-motion visitors and devices without WebGL never download it.
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------------------------------------
// Title reveal
// ---------------------------------------------------------------------------------------------

const TITLE_TOTAL = 0.7; // s, whole reveal (spec: 700 ms)
const TITLE_STAGGER = 0.06; // s (spec: 60 ms)

// Resolves when the title is fully shown.
function revealTitle(title) {
  if (!title || title.dataset.revealed) return Promise.resolve();
  title.dataset.revealed = 'true';

  // Reduced motion: no split, no movement, visible immediately (spec 08: 0 ms).
  if (reducedMotion.matches) {
    title.classList.add('is-revealed');
    return Promise.resolve();
  }

  const split = SplitText.create(title, {
    type: 'words',
    mask: 'words',
    wordsClass: 'hero-title__word',
    aria: 'auto', // h1 keeps an aria-label with the full sentence, word spans are aria-hidden
  });

  // Every word finishes by 700 ms: last word starts at (n-1) × 60 ms and runs the remainder.
  const duration = Math.max(0.3, TITLE_TOTAL - TITLE_STAGGER * (split.words.length - 1));

  title.classList.add('is-revealed'); // words are still under their masks (yPercent set below)
  return new Promise((resolve) => {
    gsap.fromTo(
      split.words,
      { yPercent: 110 },
      {
        yPercent: 0,
        duration,
        ease: 'expo.out',
        stagger: TITLE_STAGGER,
        onComplete: () => {
          split.revert(); // back to plain text: normal wrapping on resize, clean a11y tree
          resolve();
        },
      }
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Water shader
// ---------------------------------------------------------------------------------------------

const PARALLAX = 0.3; // water layer shifts 0.3 × scrollY (scroll 300 px → 90 px)
const MAX_DPR = 1.5; // soft photo + distortion: full retina resolution is not worth the fill rate

// The original "LAV · Labe river" GLSL (Figma shader 85de6274) was not exportable; this is an interpretation:
// sine-based UV displacement (several drifting wave trains + a cheap value-noise), limited to the river part
// of the photo, plus faint specular glints and a slight cool grade on the water.
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uImage;
  uniform vec2 uResolution;   // canvas size in CSS px
  uniform vec2 uImageSize;    // natural image size
  uniform float uTime;        // s
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  // object-fit: cover
  vec2 coverUv(vec2 uv) {
    float canvasRatio = uResolution.x / uResolution.y;
    float imageRatio = uImageSize.x / uImageSize.y;
    vec2 scale = canvasRatio > imageRatio
      ? vec2(1.0, imageRatio / canvasRatio)
      : vec2(canvasRatio / imageRatio, 1.0);
    return (uv - 0.5) * scale + 0.5;
  }

  void main() {
    vec2 uv = coverUv(vUv);
    // Image space, y down (0 = top of photo) for the water mask below.
    vec2 img = vec2(uv.x, 1.0 - uv.y);

    // Water: the river is roughly the lower ~55 % of hero-article.jpg; leave the eight (boat + crew) calm.
    float water = smoothstep(0.40, 0.62, img.y);
    float boat = 1.0 - smoothstep(0.55, 1.0, length((img - vec2(0.60, 0.52)) / vec2(0.26, 0.14)));
    water *= 1.0 - boat * 0.85;

    // Wave field in px space so the ripple size is independent of the canvas size.
    vec2 p = vUv * uResolution;
    float t = uTime;

    // Perspective: ripples get larger/stronger towards the viewer (bottom of the photo).
    float depth = mix(0.6, 1.4, img.y);
    vec2 q = p / depth;

    float w = 0.0;
    w += sin(q.y * 0.090 + t * 1.10 + sin(q.x * 0.012 + t * 0.3) * 2.0);
    w += sin(q.y * 0.155 - q.x * 0.020 + t * 1.70) * 0.6;
    w += sin(q.x * 0.035 + q.y * 0.060 - t * 0.90) * 0.4;
    float n = noise(q * 0.045 + vec2(t * 0.25, -t * 0.6)) - 0.5;

    vec2 offset = vec2(w * 0.35 + n * 1.2, w * 0.9 + n * 0.8) * depth * water; // px
    vec2 sampleUv = coverUv(vUv + offset / uResolution);
    vec3 color = texture2D(uImage, clamp(sampleUv, 0.001, 0.999)).rgb;

    // Glints on wave crests + a slight cool/teal grade on the water only.
    float crest = smoothstep(0.75, 1.0, sin(q.y * 0.155 - q.x * 0.020 + t * 1.70) * 0.5 + 0.5 + n * 0.6);
    color += crest * water * 0.06;
    color = mix(color, color * vec3(0.95, 1.0, 1.04), water * 0.6);

    gl_FragColor = vec4(color, 1.0);
  }
`;

async function createWater(box, image) {
  const { WebGLRenderer, Scene, OrthographicCamera, PlaneGeometry, ShaderMaterial, Mesh, Texture, Vector2 } =
    await import('three');

  // WebGL unavailable / blocked → keep the static photo.
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }

  const canvas = renderer.domElement;
  canvas.className = 'hero-water';
  canvas.setAttribute('aria-hidden', 'true');

  const texture = new Texture(image);
  // Default NoColorSpace: sRGB bytes pass through the raw ShaderMaterial untouched → same colors as the <img>.
  texture.needsUpdate = true;

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uImage: { value: texture },
      uResolution: { value: new Vector2(1, 1) },
      uImageSize: { value: new Vector2(image.naturalWidth, image.naturalHeight) },
      uTime: { value: 0 },
    },
  });
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const resize = () => {
    const { width, height } = box.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    renderer.setSize(width, height, false);
    material.uniforms.uResolution.value.set(width, height);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(box);
  resize();

  // Render loop runs only while the hero is on screen and the tab is visible.
  let frame = 0;
  let inView = true;
  let start = performance.now();
  let elapsed = 0;

  const render = (now) => {
    frame = 0;
    elapsed = (now - start) / 1000;
    material.uniforms.uTime.value = elapsed;
    // Parallax: the whole water layer (photo + canvas) lags the page by 0.3 × scroll, read once per frame.
    box.style.setProperty('--hero-parallax', `${(window.scrollY * PARALLAX).toFixed(1)}px`);
    renderer.render(scene, camera);
    if (!canvas.isConnected) box.append(canvas); // first frame drawn → show canvas (fades in via CSS)
    loop();
  };
  const loop = () => {
    if (!frame && inView && !document.hidden) frame = requestAnimationFrame(render);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) {
      start = performance.now() - elapsed * 1000; // resume where the water left off
      loop();
    } else stop();
  });
  intersectionObserver.observe(box);

  const onVisibility = () => {
    if (document.hidden) stop();
    else {
      start = performance.now() - elapsed * 1000;
      loop();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  loop();

  return {
    destroy() {
      stop();
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      box.style.removeProperty('--hero-parallax');
      canvas.remove();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

function initWater(box) {
  const image = box?.querySelector('img');
  if (!box || !image) return;

  let water = null;
  let pending = null;

  const start = () => {
    if (water || pending || reducedMotion.matches) return;
    pending = image
      .decode()
      .catch(() => {})
      .then(() => (image.naturalWidth && !reducedMotion.matches ? createWater(box, image) : null))
      .catch(() => null) // three.js chunk failed to load → static photo
      .then((instance) => {
        pending = null;
        // Preference may have flipped to "reduce" while three.js was loading.
        if (instance && reducedMotion.matches) instance.destroy();
        else water = instance;
      });
  };

  // Reduced motion: fully static photo, no shader, no parallax (spec 08). Reacts to live preference changes.
  const stop = () => {
    water?.destroy();
    water = null;
  };

  reducedMotion.addEventListener('change', () => (reducedMotion.matches ? stop() : start()));
  start();
}

// ---------------------------------------------------------------------------------------------

// Guard against double init (script included twice, bfcache restores keep the same DOM anyway).
const hero = document.querySelector('.js-hero');

if (hero && !hero.dataset.motionInit) {
  hero.dataset.motionInit = 'true';
  // Water starts after the 700 ms reveal so parsing three.js / compiling the shader can't make the title stutter.
  revealTitle(hero.querySelector('.js-hero-title')).then(() => initWater(hero.querySelector('.js-hero-photo')));
}
