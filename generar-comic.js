/**
 * Arma CBZ y PDF a partir de las imágenes descargadas por marmota.js
 *
 * Uso:
 *   npm install pdf-lib adm-zip
 *   node generar-comic.js [serie] [formato]
 *
 *   [serie]   = nombre de la carpeta en backup/ (ej: dc-k-o-2025)
 *               si no lo pones, usa la primera serie que encuentre.
 *   [formato] = cbz | pdf | ambos   (por defecto: ambos)
 *
 * Ejemplos:
 *   node generar-comic.js dc-k-o-2025
 *   node generar-comic.js dc-k-o-2025 cbz
 *   node generar-comic.js                  (autodetecta)
 *
 * Genera un archivo por cómic dentro de la carpeta de la serie.
 * CBZ = formato nativo de cómics (ligero). PDF = universal.
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const AdmZip = require('adm-zip');

const BACKUP_DIR = 'backup';

function elegirSerie() {
  const arg = process.argv[2];
  if (arg && !['cbz', 'pdf', 'ambos'].includes(arg)) return arg;
  if (!fs.existsSync(BACKUP_DIR)) {
    console.error('❌ No existe la carpeta backup/. Corre primero marmota.js');
    process.exit(1);
  }
  const series = fs.readdirSync(BACKUP_DIR).filter(d =>
    fs.existsSync(path.join(BACKUP_DIR, d, 'manifest.json'))
  );
  if (series.length === 0) {
    console.error('❌ No encontré ninguna serie con manifest.json en backup/');
    process.exit(1);
  }
  return series[0];
}

// El formato puede venir como 2º o 1er argumento
function elegirFormato() {
  const args = process.argv.slice(2);
  const f = args.find(a => ['cbz', 'pdf', 'ambos'].includes(a));
  return f || 'ambos';
}

async function armarPdf(imagenes, salida) {
  const pdf = await PDFDocument.create();
  for (const imgPath of imagenes) {
    const bytes = fs.readFileSync(imgPath);
    const ext = imgPath.split('.').pop().toLowerCase();
    let img;
    try {
      img = (ext === 'png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch {
      // Si falla como jpg, intentar png y viceversa
      try { img = await pdf.embedPng(bytes); } catch { continue; }
    }
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  fs.writeFileSync(salida, await pdf.save());
  return pdf.getPageCount();
}

function armarCbz(imagenes, salida) {
  const zip = new AdmZip();
  imagenes.forEach((imgPath, i) => {
    const ext = imgPath.split('.').pop().toLowerCase();
    zip.addFile(`page-${String(i + 1).padStart(3, '0')}.${ext}`, fs.readFileSync(imgPath));
  });
  zip.writeZip(salida);
}

async function main() {
  const serie = elegirSerie();
  const formato = elegirFormato();
  const serieDir = path.join(BACKUP_DIR, serie);
  const manifestPath = path.join(serieDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ No se encontró ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`📕 Serie: ${serie}`);
  console.log(`📚 ${manifest.comics.length} cómic(s) — formato: ${formato}\n`);

  for (const c of manifest.comics) {
    const imagenes = c.paginas.map(p => path.join(serieDir, p)).filter(p => fs.existsSync(p));
    if (imagenes.length === 0) {
      console.log(`   ⚠ ${c.comic}: sin imágenes, saltando`);
      continue;
    }

    const base = path.join(serieDir, c.comic);

    if (formato === 'cbz' || formato === 'ambos') {
      armarCbz(imagenes, `${base}.cbz`);
      console.log(`   ✓ ${c.comic}.cbz (${imagenes.length} págs)`);
    }
    if (formato === 'pdf' || formato === 'ambos') {
      const n = await armarPdf(imagenes, `${base}.pdf`);
      console.log(`   ✓ ${c.comic}.pdf (${n} págs)`);
    }
  }

  console.log(`\n🎉 ¡Listo! Los archivos están en ${serieDir}/`);
  console.log('📱 Pásalos a tu tableta y ábrelos con EBookDroid (lee CBZ y PDF).');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });