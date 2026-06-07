/**
 * Scraper de CÓMICS para marmota.me
 * Descarga las imágenes de cada cómic y las guarda en backup/.
 * Luego usa generar-comic.js para armar el CBZ o PDF.
 *
 * marmota.me NO tiene Cloudflare, así que NO necesitas abrir Brave.
 * Este script usa su propio navegador (Puppeteer headless).
 *
 * ============================================================
 * USO
 * ============================================================
 *   npm install puppeteer
 *   node marmota.js "URL_DEL_PRIMER_COMIC" [cuantos]
 *
 * Ejemplos:
 *   node marmota.js "https://marmota.me/comic/dc-k-o-2025/parte-1-superman-28-prologo/"
 *   node marmota.js "https://marmota.me/comic/dc-k-o-2025/parte-1-superman-28-prologo/" 3
 *   node marmota.js "https://marmota.me/comic/absolute-green-arrow-2026/absolute-green-arrow-1/"
 *
 * Las imágenes quedan en: backup/[serie]/[comic]/page-001.jpg ...
 * Después: node generar-comic.js [serie]
 */

const fs = require('fs');
const path = require('path');

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch {
  console.error('❌ Falta puppeteer. Ejecuta: npm install puppeteer');
  process.exit(1);
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// --- Argumentos ---
const START_URL = process.argv[2];
const LIMITE = parseInt(process.argv[3], 10) || 1000;

if (!START_URL || !START_URL.startsWith('http')) {
  console.error('❌ Falta la URL. Uso:');
  console.error('   node marmota.js "https://marmota.me/comic/serie/primer-comic/" [cuantos]');
  process.exit(1);
}

// --- Detecta serie y comic de la URL ---
// https://marmota.me/comic/[serie]/[comic]/
function parseUrl(url) {
  const m = url.match(/\/comic\/([^/]+)\/([^/]+)\/?/i);
  return m ? { serie: m[1], comic: m[2] } : { serie: 'comic', comic: 'parte' };
}

const { serie: SERIE } = parseUrl(START_URL);
const BACKUP_DIR = 'backup';
const SERIE_DIR = path.join(BACKUP_DIR, SERIE);
fs.mkdirSync(SERIE_DIR, { recursive: true });

console.log(`📕 Serie detectada: ${SERIE}`);
console.log(`💾 Imágenes en: ${SERIE_DIR}/\n`);

// Scroll automático para disparar el lazy-load de las imágenes
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const paso = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, paso);
        total += paso;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
  await delay(1000);
  // Volver arriba por si acaso
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function scrape() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 1000 });

  const manifest = { serie: SERIE, comics: [] };
  const visitados = new Set();
  let currentUrl = START_URL;
  let count = 0;

  while (currentUrl && count < LIMITE) {
    if (visitados.has(currentUrl)) { console.log('\n🔁 URL repetida, deteniendo.'); break; }
    if (count > 0 && !currentUrl.includes(`/comic/${SERIE}/`)) {
      console.log('\n✅ El siguiente ya es de otra serie, deteniendo.'); break;
    }
    visitados.add(currentUrl);

    const { comic } = parseUrl(currentUrl);
    console.log(`📖 [${count + 1}] ${comic}`);

    try {
      await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await autoScroll(page);

      // Recolectar URLs de imágenes del lector (tema Madara)
      const data = await page.evaluate(() => {
        const cont = document.querySelector('.reading-content') || document.querySelector('.read-container') || document.body;
        const imgs = Array.from(cont.querySelectorAll('img'));
        const urls = imgs.map(img => {
          let src = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') ||
                    img.currentSrc || img.getAttribute('src') || '';
          return src.trim();
        }).filter(u =>
          u && u.includes('/wp-content/uploads/') &&
          !u.includes('dflazy') && !u.includes('logo')
        );

        // Título del cómic
        const titulo = document.querySelector('.breadcrumb li.active, .breadcrumb .active')?.textContent.trim()
                     || document.title.replace(/\s*-\s*Marmota Comics.*$/i, '').trim();

        // Botón "Next"
        let next = null;
        document.querySelectorAll('a').forEach(a => {
          if (a.textContent.trim().toLowerCase() === 'next') next = a.getAttribute('href');
        });

        return { urls: [...new Set(urls)], titulo, next };
      });

      if (data.urls.length === 0) {
        console.log('   ⚠ No se encontraron imágenes (¿cambió la estructura?).');
      } else {
        console.log(`   🔎 ${data.urls.length} imágenes detectadas. Ej: ${data.urls[0]}`);

        // Carpeta de este cómic
        const comicDir = path.join(SERIE_DIR, comic);
        fs.mkdirSync(comicDir, { recursive: true });

        // Página dedicada para bajar imágenes (con referer del cómic, evita CORS y 403)
        const imgPage = await browser.newPage();
        await imgPage.setExtraHTTPHeaders({ Referer: currentUrl });

        const archivos = [];
        for (let i = 0; i < data.urls.length; i++) {
          const url = data.urls[i];
          try {
            // Navegar directo a la imagen y tomar el buffer de la respuesta
            const resp = await imgPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            if (!resp || !resp.ok()) { console.log(`   ⚠ Imagen ${i + 1} respondió ${resp ? resp.status() : 'sin respuesta'}`); continue; }
            const buffer = await resp.buffer();

            const ext = (url.split('.').pop().split(/[?#]/)[0] || 'jpg').toLowerCase();
            const nombre = `page-${String(i + 1).padStart(3, '0')}.${ext}`;
            fs.writeFileSync(path.join(comicDir, nombre), buffer);
            archivos.push(path.join(comic, nombre));
          } catch (e) {
            console.log(`   ⚠ Imagen ${i + 1} falló: ${e.message}`);
          }
        }

        await imgPage.close();

        console.log(`   ✓ "${data.titulo}" — ${archivos.length} páginas`);
        manifest.comics.push({ titulo: data.titulo, comic, paginas: archivos });
        fs.writeFileSync(path.join(SERIE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
      }

      if (!data.next) { console.log('\n🏁 No hay botón "Next". Fin.'); break; }
      currentUrl = data.next;
      count++;
      await delay(1500);

    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      break;
    }
  }

  await browser.close();
  console.log(`\n📚 Cómics descargados: ${manifest.comics.length}`);
  console.log(`💾 Manifiesto: ${path.join(SERIE_DIR, 'manifest.json')}`);
  return manifest;
}

async function main() {
  try {
    const manifest = await scrape();
    if (manifest.comics.length === 0) {
      console.error('❌ No se descargó ningún cómic.');
      process.exit(1);
    }
    console.log('\n🎉 ¡Descarga completa!');
    console.log(`👉 Ahora arma el cómic con: node generar-comic.js ${SERIE}`);
  } catch (err) {
    console.error('❌ Error general:', err.message);
    process.exit(1);
  }
}

main();