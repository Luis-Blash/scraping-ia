/**
 * Genera un EPUB a partir de un JSON de progreso (cualquier novela).
 *
 * Uso:
 *   node generar-epub.js [archivo-progreso.json]
 *
 * Ejemplos:
 *   node generar-epub.js lord-of-mysteries-progreso.json
 *   node generar-epub.js shadow-slave-progreso.json
 *
 * Si no pasas argumento, usa el primer *-progreso.json que encuentre.
 */
const epubGen = require('epub-gen-memory');
const fs = require('fs');

// Convierte "lord-of-mysteries" -> "Lord Of Mysteries"
function tituloDesdeSlug(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const BACKUP_DIR = 'backup';

// Saca solo el nombre del archivo, sin importar la carpeta ni el separador (/ o \)
function soloNombre(ruta) {
  return ruta.split(/[\\/]/).pop();
}

function buscarJson() {
  const arg = process.argv[2];
  if (arg) {
    // Si existe tal cual, úsalo; si no, búscalo dentro de backup/
    if (fs.existsSync(arg)) return arg;
    const enBackup = `${BACKUP_DIR}/${soloNombre(arg)}`;
    if (fs.existsSync(enBackup)) return enBackup;
    return arg; // dejará que falle con mensaje claro abajo
  }
  // Sin argumento: busca el primer *-progreso.json dentro de backup/
  const dir = fs.existsSync(BACKUP_DIR) ? BACKUP_DIR : '.';
  const candidatos = fs.readdirSync(dir).filter(f => f.endsWith('-progreso.json'));
  if (candidatos.length === 0) {
    console.error(`❌ No encontré ningún *-progreso.json en ${dir}/. Corre primero scraper.js`);
    process.exit(1);
  }
  return `${dir}/${candidatos[0]}`;
}

async function main() {
  const jsonFile = buscarJson();
  if (!fs.existsSync(jsonFile)) {
    console.error(`❌ No se encontró ${jsonFile}`);
    process.exit(1);
  }

  const slug = soloNombre(jsonFile).replace(/-progreso\.json$/, '');
  const titulo = tituloDesdeSlug(slug);

  let chapters = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  console.log(`📕 ${titulo}`);
  console.log(`📚 ${chapters.length} partes cargadas`);

  // Quitar imágenes (el sitio las bloquea con 403). EPUB queda solo texto.
  chapters = chapters.map(ch => ({
    title: ch.title,
    content: (ch.content || '').replace(/<img[^>]*>/gi, '')
  }));

  const options = {
    title: titulo,
    author: 'novelasligeras.net',
    lang: 'es',
    ignoreFailedDownloads: true,
    css: `
      body { font-family: Georgia, serif; font-size: 1em; line-height: 1.6; margin: 1em 2em; }
      h1, h2, h3 { text-align: center; margin: 1.5em 0 1em; }
      p { text-indent: 1.5em; margin: 0.4em 0; }
    `
  };

  console.log('📖 Generando EPUB (solo texto)...');
  const buf = await epubGen.default(options, chapters);
  const salida = `${slug}.epub`;
  fs.writeFileSync(salida, buf);
  console.log(`✅ ${salida} generado (${(buf.length/1024/1024).toFixed(2)} MB)`);
  console.log('📱 Pásalo a tu tableta y ábrelo con EBookDroid o FBReader');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });