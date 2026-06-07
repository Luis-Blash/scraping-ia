# 📚 Scraper de Novelas y Cómics

Descarga novelas y cómics para leer **sin conexión** (ideal para tablets viejas o e-readers).

Maneja dos sitios, cada uno con su propio flujo:

| Sitio | Tipo | Salida | Navegador |
|-------|------|--------|-----------|
| **novelasligeras.net** | Novelas (texto) | EPUB / PDF | Brave (por el Cloudflare) |
| **marmota.me** | Cómics (imágenes) | CBZ / PDF | Automático (headless) |

---

## 🔧 Requisitos

- [Node.js](https://nodejs.org) (v18 o superior)
- Navegador **Brave** (o Chrome) instalado — solo para las novelas
- Conexión a internet

---

## 📦 Instalación

En la carpeta del proyecto:

```bash
npm install
```

Dependencias:
- `puppeteer-core` → conecta el scraper de novelas a tu Brave
- `puppeteer` → navegador para cómics y para renderizar PDF
- `epub-gen-memory` → genera el EPUB de novelas
- `pdf-lib` + `adm-zip` → arman el PDF y CBZ de cómics

---

# 📖 NOVELAS (novelasligeras.net)

El sitio usa **Cloudflare**, que bloquea los scrapers normales. La solución es
conectarse a tu **Brave** real (que ya pasó la verificación humana).

## Paso 1 — Abrir Brave en modo debugging

Cierra **todas** las ventanas de Brave (revisa en el Administrador de Tareas que
no quede `brave.exe`). Luego, en una terminal nueva:

```bash
"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222 --user-data-dir="C:\brave-scraping"
```

> Se abre una ventana de Brave especial. **No la cierres** mientras scrapeas.
> Usa un perfil separado (`C:\brave-scraping`), así no toca tu Brave normal.
> Esta ventana sirve para varias novelas seguidas; solo se abre una vez por sesión.

## Paso 2 — Resolver Cloudflare y descargar

En esa ventana de Brave, entra al **primer capítulo** de la novela y resuelve el
Cloudflare (marca la casilla). Después, en otra terminal:

```bash
node scraper.js "URL_DEL_PRIMER_CAPITULO"
```

Detecta solo el nombre de la novela, sigue el botón "Siguiente" y guarda el texto
en `backup/[novela]-progreso.json`.

**Limitar cuántos capítulos** (segundo argumento):

```bash
node scraper.js "URL_DEL_PRIMER_CAPITULO" 5
```

## Paso 3 — Generar el libro

```bash
# EPUB (recomendado: ajusta tamaño de letra en la tablet)
node generar-epub.js [novela]-progreso.json

# o PDF (tamaño fijo A5)
node generar-pdf.js [novela]-progreso.json
```

### Ejemplos reales

```bash
# Tsuki ga Michibiku (solo el vol 1 es gratis; se detiene en el contenido de pago)
node scraper.js "https://novelasligeras.net/index.php/2021/06/19/tsuki-ga-michibiku-isekai-douchuu-volumen-1-prologo-parte-1-novela-ligera/"
node generar-epub.js tsuki-ga-michibiku-isekai-douchuu-progreso.json

# Shadow Slave — solo los primeros 5 capítulos
node scraper.js "https://novelasligeras.net/index.php/2025/09/17/shadow-slave-cap-1-novela-web-2/" 5
node generar-epub.js shadow-slave-progreso.json
```

**El scraper de novelas se detiene solo cuando:** ya no hay botón "Siguiente", llega
a contenido de pago (`novela-protegida`), el siguiente enlace es de otra novela,
detecta un bucle, o alcanza el límite.

> **Nota:** el sitio bloquea las ilustraciones (error 403), así que los libros salen solo con texto.

---

# 🦸 CÓMICS (marmota.me)

Marmota **no tiene Cloudflare**, así que NO necesitas abrir Brave. El scraper usa
su propio navegador automático.

## Paso 1 — Descargar las imágenes

```bash
node marmota.js "URL_DEL_PRIMER_COMIC" [cuantos]
```

Detecta la serie, sigue el botón "Next" y descarga las páginas en
`backup/[serie]/[comic]/`.

## Paso 2 — Armar el cómic

```bash
node generar-comic.js [serie] [formato]
```

- `[formato]` = `cbz`, `pdf` o `ambos` (por defecto: `ambos`)
- Genera un archivo por cómic dentro de `backup/[serie]/`

### Ejemplos reales

```bash
# DC K.O. — las primeras 2 partes
node marmota.js "https://marmota.me/comic/dc-k-o-2025/parte-1-superman-28-prologo/" 2
node generar-comic.js dc-k-o-2025

# Absolute Green Arrow — un solo número (no tiene botón Next, se detiene solo)
node marmota.js "https://marmota.me/comic/absolute-green-arrow-2026/absolute-green-arrow-1/"
node generar-comic.js absolute-green-arrow-2026 pdf
```

**El scraper de cómics se detiene solo cuando:** ya no hay botón "Next", el
siguiente es de otra serie, detecta un bucle, o alcanza el límite.

### CBZ vs PDF

- **PDF** → universal, lo abre cualquier visor (Google PDF Viewer, EBookDroid).
- **CBZ** → formato nativo de cómics (un ZIP de imágenes, más ligero). En la tablet
  lo abre **EBookDroid**, Perfect Viewer o ComicScreen.

---

## ⚙️ Cómo funciona

```
NOVELAS:
scraper.js ──► backup/[novela]-progreso.json ──┬─► generar-epub.js ─► [novela].epub
                                               └─► generar-pdf.js  ─► [novela].pdf

CÓMICS:
marmota.js ──► backup/[serie]/[comic]/*.jpg ──► generar-comic.js ─► [comic].cbz / .pdf
```

> Los generadores de novela buscan el JSON dentro de `backup/` automáticamente:
> puedes pasar solo el nombre, la ruta completa, o nada (toma el primero que encuentre).

---

## 🛠 Solución de problemas

| Problema | Solución |
|----------|----------|
| `connect ECONNREFUSED ...:9222` | Brave no está en modo debugging. Repite el Paso 1 de novelas. |
| Se queda en "Cloudflare otra vez" | Resuelve la casilla en la ventana de Brave; el script sigue solo. |
| `No encontré ningún *-progreso.json` | Corre primero `scraper.js`. |
| El scraper descarga de más | Usa el límite: `node scraper.js "URL" 5`. |
| Cómic: `0 imágenes detectadas` | El selector del lector cambió; avisa para ajustarlo. |
| Cómic: imagen responde `403` | Problema de referer/hotlink; avisa para ajustar los headers. |
| `Falta puppeteer` / `pdf-lib` | Ejecuta `npm install`. |

---

## 📁 Estructura del proyecto

```
web-scraping/
├── scraper.js                 # Novelas: descarga capítulos (necesita Brave)
├── generar-epub.js            # Novelas: JSON → EPUB
├── generar-pdf.js             # Novelas: JSON → PDF
├── marmota.js                 # Cómics: descarga imágenes (headless)
├── generar-comic.js           # Cómics: imágenes → CBZ / PDF
├── package.json
├── README.md
├── .gitignore
├── backup/                    # Respaldos descargados (ignorada por git)
│   ├── [novela]-progreso.json
│   └── [serie]/[comic]/*.jpg
└── [novela].epub/.pdf         # Libros y cómics generados
```

---

## ⚖️ Nota legal

Proyecto para **uso personal** (leer offline contenido al que ya tienes acceso).
Respeta los términos de cada sitio y el trabajo de autores y traductores.
No redistribuyas los archivos generados.