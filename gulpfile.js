const { src, dest, watch, series, parallel } = require('gulp');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const fileInclude = require('gulp-file-include');
const sass = require('gulp-sass')(require('sass'));
const postcss = require('gulp-postcss');
const svgSprite = require('gulp-svg-sprite');
const browserSync = require('browser-sync').create();
const { Parcel } = require('@parcel/core');

const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('build');

const paths = {
  dist: 'dist',
  html: { src: 'src/*.html', watch: 'src/**/*.html', dest: 'dist' },
  styles: { src: 'src/styles/main.scss', watch: 'src/styles/**/*.scss', dest: 'dist/css' },
  js: { src: 'src/js/*.parcel.js', dest: 'dist/js' },
  icons: { src: 'src/icons/*.svg', dest: 'dist/img' },
  img: { src: 'src/img/**/*', dest: 'dist/img' },
  fonts: { src: 'src/fonts/**/*', dest: 'dist/fonts' },
};

function clean(done) {
  fs.rmSync(paths.dist, { recursive: true, force: true });
  done();
}

function html() {
  return src(paths.html.src)
    .pipe(fileInclude({ prefix: '@@', basepath: '@file' }))
    .pipe(dest(paths.html.dest))
    .pipe(browserSync.stream());
}

function styles() {
  return src(paths.styles.src, { sourcemaps: !isProd })
    .pipe(sass({ outputStyle: isProd ? 'compressed' : 'expanded' }).on('error', sass.logError))
    .pipe(postcss())
    .pipe(dest(paths.styles.dest, { sourcemaps: '.' }))
    .pipe(browserSync.stream({ match: '**/*.css' }));
}

// Parcel bundles every src/js/*.parcel.js entry into dist/js/.
// Explicit `targets` override package.json "main" so Parcel doesn't treat this as a library.
function createBundler() {
  return new Parcel({
    entries: paths.js.src,
    defaultConfig: '@parcel/config-default',
    mode: isProd ? 'production' : 'development',
    shouldDisableCache: false,
    defaultTargetOptions: {
      distDir: paths.js.dest,
      shouldOptimize: isProd,
      sourceMaps: !isProd,
    },
    targets: {
      default: {
        distDir: paths.js.dest,
        context: 'browser',
        outputFormat: 'esmodule',
        isLibrary: false,
      },
    },
  });
}

async function scripts() {
  if (!fs.readdirSync('src/js').some((f) => f.endsWith('.parcel.js'))) return;
  const { bundleGraph } = await createBundler().run();
  console.log(`Parcel: built ${bundleGraph.getBundles().length} bundle(s)`);
}

async function watchScripts() {
  let first = true;
  await createBundler().watch((err, event) => {
    if (err) return console.error(err);
    if (event.type === 'buildFailure') {
      return event.diagnostics.forEach((d) => console.error(`Parcel: ${d.message}`));
    }
    if (first) {
      first = false;
      return;
    }
    browserSync.reload();
  });
}

// Icons that keep their original colors (everything else is recolorable via CSS `color`).
const multicolorIcons = ['logo', 'logo-nobg'];

// Skip icons the sprite can't represent faithfully instead of guessing.
const validateIcon = () =>
  new Transform({
    objectMode: true,
    transform(file, _enc, cb) {
      const svg = file.contents.toString();
      const reason = !/<svg[^>]*\sviewBox="[\d.\s-]+"/.test(svg)
        ? 'missing or invalid viewBox'
        : /<image[\s>]/.test(svg)
          ? 'embedded raster image'
          : null;
      if (reason) {
        console.warn(`icons: skipped ${file.basename} (${reason})`);
        return cb();
      }
      cb(null, file);
    },
  });

// Per-icon SVGO pass: strip metadata/size, recolor to currentColor, prefix internal ids.
// Deliberately no path-rewriting plugins (convertPathData, mergePaths, ...), so paths stay untouched.
// `svgo` is the copy svg-sprite itself depends on.
function optimizeIcon(shape, _spriter, cb) {
  const name = path.basename(shape.name, '.svg');
  try {
    const { data } = require('svgo').optimize(shape.getSVG(false), {
      plugins: [
        'removeXMLProcInst',
        'removeDoctype',
        'removeComments',
        'removeMetadata',
        'removeEditorsNSData',
        'removeDimensions',
        ...(multicolorIcons.includes(name) ? [] : [{ name: 'convertColors', params: { currentColor: true } }]),
        { name: 'prefixIds', params: { prefix: `sprite-${name}`, delim: '-' } },
      ],
    });
    shape.setSVG(data);
    cb(null);
  } catch (err) {
    cb(err);
  }
}

function icons() {
  return src(paths.icons.src)
    .pipe(validateIcon())
    .pipe(
      svgSprite({
        mode: { symbol: { dest: '.', sprite: '_symbols.svg' } },
        shape: {
          id: { generator: (name) => `sprite-${path.basename(name, '.svg')}` },
          transform: [optimizeIcon],
        },
        svg: {
          xmlDeclaration: false,
          doctypeDeclaration: false,
          namespaceIDs: false, // ids are prefixed per icon by optimizeIcon
          namespaceClassnames: false,
          dimensionAttributes: false,
        },
      })
    )
    .pipe(dest(paths.icons.dest))
    .pipe(browserSync.stream());
}

// gulp-imagemin v9 is ESM-only, so load it lazily from this CJS gulpfile.
async function images() {
  const { default: imagemin, gifsicle, mozjpeg, optipng, svgo } = await import('gulp-imagemin');
  return new Promise((resolve, reject) => {
    src(paths.img.src, { encoding: false })
      .pipe(imagemin([gifsicle(), mozjpeg({ quality: 80 }), optipng(), svgo()], { silent: true }))
      .pipe(dest(paths.img.dest))
      .on('end', resolve)
      .on('finish', resolve)
      .on('error', reject);
  });
}

function fonts() {
  return src(paths.fonts.src, { encoding: false }).pipe(dest(paths.fonts.dest));
}

function serve(done) {
  browserSync.init({ server: { baseDir: paths.dist }, notify: false, open: false });
  done();
}

function reload(done) {
  browserSync.reload();
  done();
}

function watchFiles() {
  // Tailwind scans HTML/JS for classes, so rebuild CSS on those changes too.
  watch(paths.html.watch, series(html, styles));
  watch([paths.styles.watch, 'tailwind.config.js'], styles);
  watch('src/js/**/*.js', styles);
  watch(paths.icons.src, series(icons, html)); // html inlines the sprite
  watch(paths.img.src, series(images, reload));
  watch(paths.fonts.src, series(fonts, reload));
}

// icons must finish first: html inlines dist/img/_symbols.svg via components/sprite.html
const assets = series(icons, parallel(html, images, fonts));

exports.clean = clean;
exports.html = html;
exports.styles = styles;
exports.scripts = scripts;
exports.icons = icons;
exports.images = images;
exports.fonts = fonts;
exports.build = series(clean, assets, parallel(styles, scripts));
exports.dev = series(clean, assets, styles, serve, parallel(watchFiles, watchScripts));
exports.default = exports.dev;
