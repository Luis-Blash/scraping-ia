/**
 * Genera un EPUB a partir de un JSON de progreso (cualquier novela).
 * Incluye las ilustraciones descargadas por scraper.js (si las hay).
 *
 * Uso:
 *   node generar-epub.js [archivo-progreso.json]
 *
 * Las imágenes están en backup/[slug]/images/ y se incrustan mediante un
 * mini-servidor local temporal (así la librería les asigna el tipo correcto).
 */
const epubGen = require('epub-gen-memory');
const http = require('http');
const fs = require('fs');
const path = require('path');

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

// Mini-servidor local que sirve la carpeta de la novela (para las imágenes)
function iniciarServidor(rootDir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const fp = path.join(rootDir, decodeURIComponent(req.url.split('?')[0]));
      if (fp.startsWith(rootDir) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        res.writeHead(200);
        fs.createReadStream(fp).pipe(res);
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
  const novelaDir = path.join(BACKUP_DIR, slug); // aquí vive images/

  let chapters = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  console.log(`📕 ${titulo}`);
  console.log(`📚 ${chapters.length} partes cargadas`);

  // Si hay carpeta de imágenes, levantamos el servidor y reescribimos los src
  let server = null;
  let coverUrl = null;
  let base = '';
  const tieneImgs = fs.existsSync(path.join(novelaDir, 'images'));
  if (tieneImgs) {
    server = await iniciarServidor(novelaDir);
    base = `http://127.0.0.1:${server.address().port}`;
    // En el HTML las imágenes están como src="images/img-XXXX.jpg"
    chapters = chapters.map(ch => ({
      title: ch.title,
      content: (ch.content || '').replace(/src=["'](images\/[^"']+)["']/g, `src="${base}/$1"`)
    }));
    const total = chapters.reduce((n, c) => n + (c.content.match(/<img/g) || []).length, 0);
    console.log(`🖼  ${total} ilustración/es se incrustarán`);

    // Usar la primera imagen como portada (en novelas ligeras suele serlo)
    const imgs = fs.readdirSync(path.join(novelaDir, 'images'))
      .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .sort();
    if (imgs.length) {
      coverUrl = `${base}/images/${imgs[0]}`;
      console.log(`📔 Portada: ${imgs[0]}`);
    }
  } else {
    // Sin carpeta de imágenes: quitar cualquier img suelta para no romper la generación
    chapters = chapters.map(ch => ({ title: ch.title, content: (ch.content || '').replace(/<img[^>]*>/gi, '') }));
  }

  const options = {
    title: titulo,
    author: 'novelasligeras.net',
    lang: 'es',
    ignoreFailedDownloads: true,
    ...(coverUrl ? { cover: coverUrl } : {}),
    css: `
      body { font-family: Georgia, serif; font-size: 1em; line-height: 1.6; margin: 1em 2em; }
      h1, h2, h3 { text-align: center; margin: 1.5em 0 1em; }
      p { text-indent: 1.5em; margin: 0.4em 0; }
      img { max-width: 100%; height: auto; display: block; margin: 1em auto; text-indent: 0; }
    `
  };

  console.log('📖 Generando EPUB...');
  const buf = await epubGen.default(options, chapters);
  if (server) server.close();

  const salida = `${slug}.epub`;
  fs.writeFileSync(salida, buf);
  console.log(`✅ ${salida} generado (${(buf.length/1024/1024).toFixed(2)} MB)`);
  console.log('📱 Pásalo a tu tableta y ábrelo con EBookDroid o FBReader');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });