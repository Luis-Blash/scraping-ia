/**
 * Genera un PDF a partir de un JSON de progreso (cualquier novela).
 * Incluye las ilustraciones descargadas por scraper.js (si las hay).
 *
 * Uso:
 *   npm install puppeteer
 *   node generar-pdf.js [archivo-progreso.json]
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

let puppeteer;
try { puppeteer = require('puppeteer'); }
catch { console.error('❌ Falta puppeteer. Ejecuta: npm install puppeteer'); process.exit(1); }

const BACKUP_DIR = 'backup';

function tituloDesdeSlug(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function soloNombre(ruta) { return ruta.split(/[\\/]/).pop(); }

function buscarJson() {
  const arg = process.argv[2];
  if (arg) {
    if (fs.existsSync(arg)) return arg;
    const enBackup = path.join(BACKUP_DIR, soloNombre(arg));
    if (fs.existsSync(enBackup)) return enBackup;
    return arg;
  }
  const dir = fs.existsSync(BACKUP_DIR) ? BACKUP_DIR : '.';
  const candidatos = fs.readdirSync(dir).filter(f => f.endsWith('-progreso.json'));
  if (candidatos.length === 0) {
    console.error(`❌ No encontré ningún *-progreso.json en ${dir}/. Corre primero scraper.js`);
    process.exit(1);
  }
  return path.join(dir, candidatos[0]);
}

function iniciarServidor(rootDir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const fp = path.join(rootDir, decodeURIComponent(req.url.split('?')[0]));
      if (fp.startsWith(rootDir) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        res.writeHead(200); fs.createReadStream(fp).pipe(res);
      } else { res.writeHead(404); res.end(); }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const jsonFile = buscarJson();
  if (!fs.existsSync(jsonFile)) { console.error(`❌ No se encontró ${jsonFile}`); process.exit(1); }

  const slug = soloNombre(jsonFile).replace(/-progreso\.json$/, '');
  const titulo = tituloDesdeSlug(slug);
  const novelaDir = path.join(BACKUP_DIR, slug);

  let chapters = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  console.log(`📕 ${titulo}`);
  console.log(`📚 ${chapters.length} partes cargadas`);

  let server = null;
  let base = '';
  const tieneImgs = fs.existsSync(path.join(novelaDir, 'images'));
  if (tieneImgs) {
    server = await iniciarServidor(novelaDir);
    base = `http://127.0.0.1:${server.address().port}`;
    chapters = chapters.map(ch => ({
      title: ch.title,
      content: (ch.content || '').replace(/src=["'](images\/[^"']+)["']/g, `src="${base}/$1"`)
    }));
  } else {
    chapters = chapters.map(ch => ({ title: ch.title, content: (ch.content || '').replace(/<img[^>]*>/gi, '') }));
  }

  const cuerpo = chapters.map(ch => `
    <section class="capitulo"><h2>${ch.title || 'Capítulo'}</h2>${ch.content}</section>
  `).join('\n');

  const html = `
<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><style>
  @page { margin: 1.5cm 1.2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; }
  h1.portada { text-align: center; font-size: 24pt; margin-top: 40%; }
  h1.portada small { display: block; font-size: 13pt; color: #555; margin-top: 1em; }
  h2 { text-align: center; font-size: 16pt; margin: 1.5em 0 1em; page-break-before: always; }
  .capitulo:first-of-type h2 { page-break-before: avoid; }
  p { text-indent: 1.5em; margin: 0.4em 0; text-align: justify; }
  img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
</style></head>
<body>
  <h1 class="portada">${titulo}<small>novelasligeras.net</small></h1>
  ${cuerpo}
</body></html>`;

  console.log('🖨  Renderizando PDF...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120000 });
  const salida = `${slug}.pdf`;
  await page.pdf({
    path: salida, format: 'A5', printBackground: true,
    margin: { top: '1.5cm', bottom: '1.5cm', left: '1.2cm', right: '1.2cm' }
  });
  await browser.close();
  if (server) server.close();

  const sizeMB = (fs.statSync(salida).size / 1024 / 1024).toFixed(2);
  console.log(`✅ ${salida} generado (${sizeMB} MB)`);
  console.log('📱 Pásalo a tu tableta y ábrelo con Google PDF Viewer o EBookDroid');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });