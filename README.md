# 📚 NovelasLigeras Scraper

Descarga novelas completas de **novelasligeras.net** y las convierte en **EPUB** o **PDF** para leer sin conexión (ideal para tablets viejas o e-readers).

El sitio usa protección **Cloudflare** que bloquea los scrapers normales. La solución de este proyecto es conectarse a tu navegador **Brave** real (que ya pasó la verificación), evitando el bloqueo.

---

## 🔧 Requisitos

- [Node.js](https://nodejs.org) (v18 o superior)
- Navegador **Brave** (o Chrome) instalado
- Conexión a internet

---

## 📦 Instalación

En la carpeta del proyecto:

```bash
npm install
```

Esto instala las dependencias:
- `puppeteer-core` → conecta el scraper a tu Brave
- `puppeteer` → renderiza el PDF
- `epub-gen-memory` → genera el EPUB

---

## 🚀 Uso

El flujo tiene **3 pasos**. El paso 1 solo se hace una vez por sesión.

### Paso 1 — Abrir Brave en modo debugging

Cierra **todas** las ventanas de Brave primero (revisa que no quede `brave.exe` en el Administrador de Tareas).

Luego abre una terminal nueva y pega:

```bash
"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222 --user-data-dir="C:\brave-scraping"
```

> Se abre una ventana de Brave especial. **No la cierres** mientras scrapeas.
> Usa un perfil separado (`C:\brave-scraping`), así no toca tu Brave normal.

### Paso 2 — Resolver Cloudflare y descargar

En esa ventana de Brave, entra al **primer capítulo** de la novela que quieras y resuelve el Cloudflare (marca la casilla "Verifique que es un ser humano").

Después, en otra terminal dentro de la carpeta del proyecto:

```bash
node scraper.js "URL_DEL_PRIMER_CAPITULO"
```

El scraper detecta solo el nombre de la novela, recorre todos los capítulos siguiendo el botón "Siguiente" y guarda el texto en `backup/[nombre-novela]-progreso.json`.

**Limitar cuántos capítulos descargar** (segundo argumento, útil para novelas largas):

```bash
node scraper.js "URL_DEL_PRIMER_CAPITULO" 5
```

### Paso 3 — Generar el libro

```bash
# EPUB (recomendado para leer en tablet: ajusta tamaño de letra)
node generar-epub.js [nombre-novela]-progreso.json

# o PDF (tamaño fijo A5)
node generar-pdf.js [nombre-novela]-progreso.json
```

El archivo final (`[nombre-novela].epub` o `.pdf`) queda en la carpeta, listo para pasar a tu tablet por USB y abrir con **EBookDroid** o **FBReader**.

---

## 📖 Ejemplos reales

```bash
# Tsuki ga Michibiku (novela ligera, varios volúmenes — solo el vol 1 es gratis)
node scraper.js "https://novelasligeras.net/index.php/2021/06/19/tsuki-ga-michibiku-isekai-douchuu-volumen-1-prologo-parte-1-novela-ligera/"
node generar-epub.js tsuki-ga-michibiku-isekai-douchuu-progreso.json

# Lord of Mysteries (novela web, cientos de capítulos)
node scraper.js "https://novelasligeras.net/index.php/2022/12/11/lord-of-mysteries-vol-1-cap-1-novela-web/" 20
node generar-epub.js lord-of-mysteries-progreso.json

# Shadow Slave — solo los primeros 5 capítulos
node scraper.js "https://novelasligeras.net/index.php/2025/09/17/shadow-slave-cap-1-novela-web-2/" 5
node generar-epub.js shadow-slave-progreso.json
```

---

## ⚙️ Cómo funciona

```
scraper.js          → descarga capítulos → backup/[novela]-progreso.json
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                        ▼
                  generar-epub.js                          generar-pdf.js
                          │                                        │
                          ▼                                        ▼
                   [novela].epub                            [novela].pdf
```

> Los generadores buscan el JSON dentro de `backup/` automáticamente.
> Puedes pasar solo el nombre (`node generar-epub.js shadow-slave-progreso.json`),
> la ruta completa (`backup/shadow-slave-progreso.json`), o nada (toma el primero que encuentre).

**El scraper se detiene automáticamente cuando:**
- Ya no hay botón "Siguiente" (fin de la novela)
- Llega a contenido de pago (URLs con `novela-protegida`)
- El siguiente enlace ya es de otra novela
- Detecta un bucle (URL repetida)
- Alcanza el límite que le pongas

**Nota sobre imágenes:** el sitio bloquea las ilustraciones con Cloudflare (error 403), así que los libros se generan solo con texto.

---

## 🛠 Solución de problemas

| Problema | Solución |
|----------|----------|
| `Error: connect ECONNREFUSED ...:9222` | Brave no está abierto en modo debugging. Repite el Paso 1. |
| Se queda en "Cloudflare otra vez" | Ve a la ventana de Brave y resuelve la casilla manualmente. El script continúa solo. |
| `No encontré ningún *-progreso.json` | Corre primero `scraper.js`. |
| El scraper descarga de más | Usa el límite: `node scraper.js "URL" 5`. |
| `Falta puppeteer` (al hacer PDF) | Ejecuta `npm install`. |

---

## 📁 Estructura del proyecto

```
web-scraping/
├── scraper.js                    # Descarga capítulos (paso principal)
├── generar-epub.js               # JSON → EPUB
├── generar-pdf.js                # JSON → PDF
├── package.json
├── README.md
├── .gitignore
├── backup/                       # Respaldos del texto descargado (ignorada por git)
│   └── [novela]-progreso.json
└── [novela].epub / .pdf          # Libros generados
```

---

## ⚖️ Nota legal

Este proyecto es para **uso personal** (leer offline contenido al que ya tienes acceso). Respeta los términos de novelasligeras.net y el trabajo de los traductores. No redistribuyas los archivos generados.