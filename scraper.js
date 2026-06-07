/**
 * Scraper GENÉRICO para novelasligeras.net (conectado a tu Brave real)
 * Funciona con CUALQUIER novela del sitio. Descarga texto E ilustraciones
 * (distingue las ilustraciones reales de los anuncios y solo baja las reales).
 *
 * ============================================================
 * USO
 * ============================================================
 * 1. Abre Brave en modo debugging (terminal nueva):
 *      "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222 --user-data-dir="C:\brave-scraping"
 *
 * 2. En esa ventana de Brave, entra al PRIMER capítulo y resuelve el Cloudflare.
 *
 * 3. En otra terminal:
 *      npm install puppeteer-core
 *      node scraper.js "https://novelasligeras.net/index.php/.../primer-capitulo/" [cuantos]
 *
 * 4. Genera backup/[novela]-progreso.json (texto) y backup/[novela]/images/ (ilustraciones).
 *    Luego: node generar-epub.js [novela]-progreso.json
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const START_URL = process.argv[2];
const LIMITE = parseInt(process.argv[3], 10) || 1000;

if (!START_URL || !START_URL.startsWith('http')) {
  console.error('❌ Falta la URL. Uso:');
  console.error('   node scraper.js "https://novelasligeras.net/index.php/.../primer-capitulo/" [cuantos]');
  process.exit(1);
}

function extractSlug(url) {
  const parts = url.split('/').filter(Boolean);
  let slug = parts[parts.length - 1];
  slug = slug.replace(/^novela-protegida-/, '');
  slug = slug.replace(/-(vol|volumen|cap|capitulo|prologo|epilogo|parte|tomo|arco)(-?\d+|\b).*$/i, '');
  return slug || 'novela';
}

const SLUG = extractSlug(START_URL);
const BACKUP_DIR = 'backup';
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
const OUTPUT_JSON = path.join(BACKUP_DIR, `${SLUG}-progreso.json`);
const IMG_DIR = path.join(BACKUP_DIR, SLUG, 'images'); // ilustraciones

console.log(`📕 Novela detectada: ${SLUG}`);
console.log(`💾 Texto en: ${OUTPUT_JSON}`);
console.log(`🖼  Ilustraciones en: ${IMG_DIR}/\n`);

async function esperarContenidoReal(page, timeoutMs = 120000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const listo = await page.evaluate(() => {
      const titulo = document.title || '';
      if (titulo.includes('momento') || titulo.includes('moment') || titulo.includes('Just a')) return false;
      const content = document.querySelector('.entry-content, article .entry-content, .post-content');
      return content && content.innerText.length > 200;
    });
    if (listo) return true;
    await delay(1000);
  }
  return false;
}

async function scrape() {
  console.log('🔌 Conectando a tu Brave (puerto 9222)...\n');

  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
    defaultViewport: null
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  // Página dedicada para bajar imágenes (usa la misma sesión de Brave => sin 403)
  const imgPage = await browser.newPage();

  const chapters = [];
  const visitados = new Set();
  const imgCache = {};   // url original -> ruta local relativa
  let imgCounter = 0;
  let currentUrl = START_URL;
  let pageCount = 0;
  let huboImagenes = false;

  while (currentUrl && pageCount < LIMITE) {
    if (visitados.has(currentUrl)) { console.log(`\n🔁 URL repetida (bucle), deteniendo.`); break; }
    if (pageCount > 0 && currentUrl.includes('novela-protegida')) { console.log(`\n🔒 Contenido de pago, fin del contenido libre.`); break; }
    if (pageCount > 0 && !currentUrl.includes(SLUG)) { console.log(`\n✅ El siguiente link ya es de otra novela, deteniendo.`); break; }

    visitados.add(currentUrl);
    console.log(`📄 [${pageCount + 1}] ${currentUrl}`);

    try {
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      const ok = await esperarContenidoReal(page);
      if (!ok) {
        console.log('   ⚠ Cloudflare otra vez. Resuélvelo en la ventana de Brave...');
        const ok2 = await esperarContenidoReal(page, 180000);
        if (!ok2) { console.log('   ❌ No se resolvió.'); break; }
      }

      const result = await page.evaluate(() => {
        const contentEl = document.querySelector('article .entry-content') || document.querySelector('.entry-content');
        if (!contentEl) return { title: null, htmlContent: '', nextUrl: null, imageUrls: [] };

        const h2s = Array.from(contentEl.querySelectorAll('h2')).map(h => h.textContent.trim());
        const title = h2s.length > 0 ? h2s.join(' · ') : (document.querySelector('h1')?.textContent.trim() || 'Capítulo');

        const clone = contentEl.cloneNode(true);
        clone.querySelectorAll('script, style, .sharedaddy, .jp-relatedposts').forEach(e => e.remove());

        // --- Clasificar imágenes: quitar anuncios, conservar ilustraciones ---
        const imageUrls = [];
        clone.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src') || '';
          const link = img.closest('a');
          const esAnuncio =
            (link && (
              (link.className || '').includes('track-ad') ||
              link.hasAttribute('data-adname') ||
              link.hasAttribute('data-adposition') ||
              (link.getAttribute('href') || '').includes('adinj_click')
            )) ||
            /publicidad|anuncio|nova-anuncio/i.test(src);

          if (esAnuncio) { if (link) link.remove(); else img.remove(); return; }
          if (!src) { img.remove(); return; }

          // Ilustración real: limpiar atributos remotos y registrar
          img.removeAttribute('srcset');
          img.removeAttribute('sizes');
          img.removeAttribute('loading');
          img.removeAttribute('decoding');
          imageUrls.push(src);
        });

        // Restos de publicidad/suscripción
        clone.querySelectorAll('a[href*="suscripcion"], a[href*="nuestras-suscripciones"], a[href*="adinj_click"]').forEach(a => {
          const p = a.closest('p'); if (p) p.remove(); else a.remove();
        });
        clone.querySelectorAll('[class*="track-ad"], [id*="ad_code"], .adsbygoogle').forEach(e => e.remove());

        const htmlContent = clone.innerHTML;

        let nextUrl = null;
        document.querySelectorAll('a').forEach(a => {
          const text = a.textContent.toLowerCase().trim();
          const href = a.getAttribute('href') || '';
          if (text === 'siguiente' && href.includes('novelasligeras.net')) nextUrl = href;
        });
        if (!nextUrl) {
          const relNext = document.querySelector('a[rel="next"]');
          if (relNext) nextUrl = relNext.getAttribute('href');
        }

        return { title, htmlContent, nextUrl, imageUrls };
      });

      let html = result.htmlContent;

      // --- Descargar las ilustraciones reales y reescribir el src a ruta local ---
      if (result.imageUrls && result.imageUrls.length) {
        fs.mkdirSync(IMG_DIR, { recursive: true });
        await imgPage.setExtraHTTPHeaders({ Referer: currentUrl });

        for (const url of result.imageUrls) {
          if (imgCache[url]) { html = html.split(url).join(imgCache[url]); continue; }
          try {
            const resp = await imgPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            if (!resp || !resp.ok()) { console.log(`   ⚠ Imagen ${resp ? resp.status() : 'sin respuesta'}: ${url}`); continue; }
            const buffer = await resp.buffer();
            const ext = (url.split('.').pop().split(/[?#]/)[0] || 'jpg').toLowerCase();
            imgCounter++;
            const nombre = `img-${String(imgCounter).padStart(4, '0')}.${ext}`;
            fs.writeFileSync(path.join(IMG_DIR, nombre), buffer);
            const rel = `images/${nombre}`;       // ruta relativa a backup/[slug]/
            imgCache[url] = rel;
            html = html.split(url).join(rel);
            huboImagenes = true;
          } catch (e) {
            console.log(`   ⚠ Falló imagen: ${e.message}`);
          }
        }
      }

      if (html && html.trim().length > 100) {
        chapters.push({ title: result.title, content: html });
        const nImgs = (html.match(/<img/g) || []).length;
        console.log(`   ✓ "${result.title}"${nImgs ? ` (${nImgs} ilustración/es)` : ''}`);
        fs.writeFileSync(OUTPUT_JSON, JSON.stringify(chapters, null, 2));
      } else {
        console.log(`   ⚠ Contenido vacío`);
      }

      if (!result.nextUrl) { console.log(`\n🏁 No hay más botón "Siguiente". Fin de la novela.`); break; }
      currentUrl = result.nextUrl;
      pageCount++;
      await delay(2000);

    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      break;
    }
  }

  await imgPage.close().catch(() => {});
  browser.disconnect();
  console.log(`\n📚 Partes descargadas: ${chapters.length}`);
  if (huboImagenes) console.log(`🖼  Ilustraciones guardadas en: ${IMG_DIR}/`);
  console.log(`💾 Guardado en: ${OUTPUT_JSON}`);
  return chapters;
}

async function main() {
  try {
    const chapters = await scrape();
    if (chapters.length === 0) { console.error('❌ No se descargaron capítulos.'); process.exit(1); }
    console.log('\n🎉 ¡Descarga completa!');
    console.log(`👉 Ahora genera el libro con: node generar-epub.js ${SLUG}-progreso.json`);
  } catch (err) {
    console.error('❌ Error general:', err.message);
    console.error('\n¿Abriste Brave con --remote-debugging-port=9222 ?');
    process.exit(1);
  }
}

main();