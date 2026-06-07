/**
 * Scraper GENÉRICO para novelasligeras.net (conectado a tu Brave real)
 * Funciona con CUALQUIER novela del sitio.
 *
 * ============================================================
 * USO
 * ============================================================
 * 1. Abre Brave en modo debugging (terminal nueva):
 *      "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222 --user-data-dir="C:\brave-scraping"
 *
 * 2. En esa ventana de Brave, entra al PRIMER capítulo de la novela que
 *    quieras y resuelve el Cloudflare (marca la casilla).
 *
 * 3. En otra terminal, corre el script pasándole la URL del primer capítulo:
 *      npm install puppeteer-core
 *      node scraper.js "https://novelasligeras.net/index.php/2022/12/11/lord-of-mysteries-vol-1-cap-1-novela-web/"
 *
 *    (Las comillas son IMPORTANTES.)
 *
 * 4. Se genera [nombre-novela]-progreso.json con todo el texto.
 *    Luego: node generar-epub.js [nombre-novela]-progreso.json
 *
 * Opcional: límite de capítulos como segundo argumento:
 *      node scraper.js "https://..." 50
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- Lee argumentos de la línea de comandos ---
const START_URL = process.argv[2];
const LIMITE = parseInt(process.argv[3], 10) || 1000; // tope de seguridad

if (!START_URL || !START_URL.startsWith('http')) {
  console.error('❌ Falta la URL. Uso:');
  console.error('   node scraper.js "https://novelasligeras.net/index.php/.../primer-capitulo/"');
  process.exit(1);
}

// --- Detecta el "slug" de la novela a partir de la URL ---
function extractSlug(url) {
  const parts = url.split('/').filter(Boolean);
  let slug = parts[parts.length - 1];
  slug = slug.replace(/^novela-protegida-/, '');
  // Corta en el primer marcador de volumen/capítulo/parte/etc.
  slug = slug.replace(/-(vol|volumen|cap|capitulo|prologo|epilogo|parte|tomo|arco)(-?\d+|\b).*$/i, '');
  return slug || 'novela';
}

const SLUG = extractSlug(START_URL);

// Los respaldos JSON van a la carpeta backup/ (créala si no existe)
const BACKUP_DIR = 'backup';
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
const OUTPUT_JSON = `${BACKUP_DIR}/${SLUG}-progreso.json`;

console.log(`📕 Novela detectada: ${SLUG}`);
console.log(`💾 Se guardará en: ${OUTPUT_JSON}\n`);

async function esperarContenidoReal(page, timeoutMs = 120000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const listo = await page.evaluate(() => {
      const titulo = document.title || '';
      if (titulo.includes('momento') || titulo.includes('moment') || titulo.includes('Just a')) {
        return false;
      }
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

  const chapters = [];
  const visitados = new Set();
  let currentUrl = START_URL;
  let pageCount = 0;

  while (currentUrl && pageCount < LIMITE) {
    // --- Criterios de parada automática ---
    if (visitados.has(currentUrl)) {
      console.log(`\n🔁 URL repetida (bucle), deteniendo.`);
      break;
    }
    if (pageCount > 0 && currentUrl.includes('novela-protegida')) {
      console.log(`\n🔒 Contenido de pago detectado, fin del contenido libre.`);
      break;
    }
    if (pageCount > 0 && !currentUrl.includes(SLUG)) {
      console.log(`\n✅ El siguiente link ya es de otra novela, deteniendo.`);
      break;
    }

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
        if (!contentEl) return { title: null, htmlContent: '', nextUrl: null };

        const h2s = Array.from(contentEl.querySelectorAll('h2')).map(h => h.textContent.trim());
        const title = h2s.length > 0 ? h2s.join(' · ') : (document.querySelector('h1')?.textContent.trim() || 'Capítulo');

        const clone = contentEl.cloneNode(true);
        clone.querySelectorAll('script, style, .sharedaddy, .jp-relatedposts').forEach(e => e.remove());
        clone.querySelectorAll('[class*="ad"], [id*="ad"]').forEach(e => e.remove());
        clone.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src') || '';
          if (src.includes('Publicidad') || src.includes('anuncio') || src.includes('nova-anuncio')) {
            const a = img.closest('a');
            if (a) a.remove(); else img.remove();
          }
        });
        clone.querySelectorAll('a[href*="suscripcion"], a[href*="nuestras-suscripciones"]').forEach(a => {
          const p = a.closest('p');
          if (p) p.remove();
        });

        const htmlContent = clone.innerHTML;

        let nextUrl = null;
        document.querySelectorAll('a').forEach(a => {
          const text = a.textContent.toLowerCase().trim();
          const href = a.getAttribute('href') || '';
          if (text === 'siguiente' && href.includes('novelasligeras.net')) {
            nextUrl = href;
          }
        });
        if (!nextUrl) {
          const relNext = document.querySelector('a[rel="next"]');
          if (relNext) nextUrl = relNext.getAttribute('href');
        }

        return { title, htmlContent, nextUrl };
      });

      if (result.htmlContent && result.htmlContent.trim().length > 100) {
        chapters.push({ title: result.title, content: result.htmlContent });
        console.log(`   ✓ "${result.title}"`);
        fs.writeFileSync(OUTPUT_JSON, JSON.stringify(chapters, null, 2));
      } else {
        console.log(`   ⚠ Contenido vacío`);
      }

      if (!result.nextUrl) {
        console.log(`\n🏁 No hay más botón "Siguiente". Fin de la novela.`);
        break;
      }

      currentUrl = result.nextUrl;
      pageCount++;
      await delay(2000);

    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      break;
    }
  }

  browser.disconnect();
  console.log(`\n📚 Partes descargadas: ${chapters.length}`);
  console.log(`💾 Guardado en: ${OUTPUT_JSON}`);
  return chapters;
}

async function main() {
  try {
    const chapters = await scrape();
    if (chapters.length === 0) {
      console.error('❌ No se descargaron capítulos.');
      process.exit(1);
    }
    console.log('\n🎉 ¡Descarga completa!');
    console.log(`👉 Ahora genera el libro con: node generar-epub.js ${OUTPUT_JSON}`);
  } catch (err) {
    console.error('❌ Error general:', err.message);
    console.error('\n¿Abriste Brave con --remote-debugging-port=9222 ?');
    process.exit(1);
  }
}

main();