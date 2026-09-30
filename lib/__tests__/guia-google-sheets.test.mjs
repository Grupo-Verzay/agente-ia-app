/**
 * El banco de la GUÍA PÚBLICA de Google Sheets (`/guia/google-sheets`).
 *
 * Las mismas cosas que la guía de Leads y la de Mis notas, y por el mismo
 * motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los botones de la barra de la
 *    hoja, los dos pasos de vincular, los avisos de un enlace que no sirve, la
 *    pestaña y las columnas que se escriben en la hoja que documenta
 *    `lib/guia-google-sheets.ts` se leen de `GoogleSheetsClient.tsx`, de la
 *    regla del enlace (`lib/url-de-google-sheets.ts`, EJECUTADA, no leída) y de
 *    `booking-form-actions.ts`. Un botón o un aviso nuevo sin su sitio en la
 *    guía pone esto en rojo.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de sus dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 * 5. **Su tarjeta sale sola** en «Tutoriales del módulo» de `/google-sheets`,
 *    con título «Guía de Google Sheets» y una descripción que cumple la regla.
 *
 * `MODO=roto` lee los ficheros de `ANTES_GOOGLE_SHEETS_REF` —pinchado a un
 * commit, nunca `origin/main`— y afirma que no había guía de Google Sheets.
 *
 * Se levanta con `scripts/banco-guia-google-sheets.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_GOOGLE_SHEETS_REF ?? "ab6b110";

const PANTALLA = "app/(root)/google-sheets/_components/GoogleSheetsClient.tsx";
const CITAS = "actions/booking-form-actions.ts";

const leer = (rel) =>
    ROTO
        ? (() => {
              try {
                  return execSync(`git show ${ANTES}:${JSON.stringify(rel)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
              } catch {
                  return "";
              }
          })()
        : readFileSync(path.join(RAIZ, rel), "utf8");

/**
 * Los mandos de la barra de la hoja, en su orden, con su `data-boton` y el
 * rótulo que enseñan al lado del icono. Se leen del marcado, entre la marca de
 * la barra y el `<iframe>`.
 */
export function losMandosDeLaBarraDeLaHoja(fuente) {
    const ini = fuente.indexOf("data-barra-de-la-hoja");
    if (ini < 0) return [];
    const fin = fuente.indexOf("<iframe", ini);
    const barra = fuente.slice(ini, fin > 0 ? fin : undefined);
    const mandos = [];
    const re = /data-boton="([^"]+)"[\s\S]*?<span className="hidden sm:inline">([^<]+)<\/span>/g;
    let m;
    while ((m = re.exec(barra))) mandos.push({ boton: m[1], nombre: m[2].trim() });
    return mandos;
}

if (ROTO) {
    test("ANTES no había guía pública de Google Sheets, ni su tarjeta", () => {
        assert.equal(leer("lib/guia-google-sheets.ts"), "", "lib/guia-google-sheets.ts ya existía en ANTES_GOOGLE_SHEETS_REF");
        assert.equal(leer("app/guia/google-sheets/page.tsx"), "", "la página ya existía en ANTES_GOOGLE_SHEETS_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_GOOGLE_SHEETS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/google-sheets/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
        assert.ok(!/["']google-sheets["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        // Y la pantalla no tenía nada que documentar como «barra de la hoja»:
        // los mandos flotaban encima de la hoja, sin rótulo.
        assert.deepEqual(losMandosDeLaBarraDeLaHoja(leer(PANTALLA)), [], "la pantalla ya tenía una barra de la hoja con rótulos");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-google-sheets/guia-google-sheets.mjs"));
    const regla = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-google-sheets/url-de-google-sheets.mjs"));
    const tutoriales = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-google-sheets/tutoriales-del-modulo.mjs"));

    test("la barra de la hoja documentada es EXACTAMENTE la de la pantalla, en su orden", () => {
        const enLaPantalla = losMandosDeLaBarraDeLaHoja(leer(PANTALLA));
        assert.equal(enLaPantalla.length, 3, `no se leyeron los tres mandos: ${JSON.stringify(enLaPantalla)}`);
        assert.deepEqual(guia.PARTES_DE_LA_BARRA_DE_LA_HOJA.map((p) => ({ boton: p.boton, nombre: p.nombre })), enLaPantalla);
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "barra-de-la-hoja.webp").texto;
        for (const [i, p] of guia.PARTES_DE_LA_BARRA_DE_LA_HOJA.entries()) {
            assert.ok(texto.includes(`${i + 1} `), `la barra de la hoja no numera el ${i + 1}`);
            assert.ok(new RegExp(p.nombre.split(" ")[0], "i").test(texto), `la barra de la hoja no nombra «${p.nombre}»`);
        }
        // Y cada botón tiene su sección con su nombre entre comillas.
        const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join("\n");
        for (const p of guia.PARTES_DE_LA_BARRA_DE_LA_HOJA) assert.ok(todo.includes(`«${p.nombre}»`), `ningún paso nombra «${p.nombre}»`);
    });

    test("los dos pasos de vincular son los que se leen en la tarjeta, y en la guía", () => {
        const pantalla = leer(PANTALLA);
        for (const paso of guia.PASOS_DE_VINCULAR) {
            assert.ok(pantalla.includes(paso), `la tarjeta ya no dice «${paso}»`);
            const titulo = paso.replace(/ como Editor$/, "");
            assert.ok(guia.laSeccion("vincular").pasos.some((p) => p.titulo === titulo), `la guía no tiene el paso «${titulo}»`);
        }
        // Los botones de la tarjeta, y el de quitar, existen con su nombre.
        for (const [marca, nombre] of [["cancelar", "Cancelar"], ["guardar", "Guardar"], ["quitar", "Quitar hoja"], ["copiar-correo", null]]) {
            assert.ok(pantalla.includes(`data-boton="${marca}"`), `la tarjeta no tiene el botón ${marca}`);
            if (nombre) assert.ok(pantalla.includes(nombre), `la tarjeta no dice «${nombre}»`);
        }
    });

    test("los avisos de un enlace que no sirve son los que SALEN, palabra por palabra", () => {
        for (const e of guia.ENLACES_QUE_NO_SIRVEN) {
            const r = regla.laHojaQueSeGuarda(e.ejemplo);
            assert.equal(r.ok, false, `«${e.ejemplo}» se guarda y la guía dice que no sirve`);
            assert.equal(r.motivo, e.motivo, `el aviso de «${e.caso}» ya no es el que enseña la guía`);
        }
        const pasos = guia.laSeccion("enlace-que-no-sirve").pasos.map((p) => p.titulo);
        for (const e of guia.ENLACES_QUE_NO_SIRVEN) assert.ok(pasos.includes(e.caso) || pasos.some((t) => e.caso.includes(t.replace(/^El de /, ""))), `ningún paso cuenta «${e.caso}»`);
        // El aviso vive debajo del campo, marcado para que la receta lo señale.
        assert.match(leer(PANTALLA), /data-motivo role="alert"/);
    });

    test("la pestaña y las columnas que se escriben en la hoja son las de la acción", () => {
        const citas = leer(CITAS);
        assert.match(citas, new RegExp(`SHEET_NAME = '${guia.PESTANA_DE_LAS_CITAS}'`), "la acción escribe en otra pestaña");
        const cabecera = /const HEADERS = \[([^\]]+)\]/.exec(citas)?.[1] ?? "";
        const fijas = [...cabecera.matchAll(/'([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual([...guia.COLUMNAS_DE_LAS_CITAS], fijas, "las columnas fijas de «Registro cita» no son las de la guía");
        const texto = guia.laSeccion("respuestas-de-citas").pasos.map((p) => `${p.titulo} ${p.texto}`).join(" ");
        assert.ok(texto.includes(guia.PESTANA_DE_LAS_CITAS));
        for (const c of guia.COLUMNAS_DE_LAS_CITAS) assert.ok(texto.includes(c), `la guía no nombra la columna «${c}»`);
    });

    test("la guía cubre la pantalla entera, y cada sección tiene su página y su miniatura", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, [
            "vista-general",
            "vincular",
            "tu-hoja",
            "copiar-enlace",
            "cambiar-de-hoja",
            "quitar-la-hoja",
            "enlace-que-no-sirve",
            "respuestas-de-citas",
        ]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/google-sheets/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("respuestas-de-citas").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"google-sheets"/);
        // La vista general numera las zonas que tiene la pantalla, en su orden.
        const texto = guia.laSeccion("vista-general").pasos[0].texto;
        guia.ZONAS_DE_LA_PANTALLA.forEach((z, i) => assert.ok(texto.includes(`${i + 1} `), `la vista general no numera la zona ${i + 1} (${z})`));
    });

    test("cada paso es corto: la captura explica, el texto pone nombre", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "google-sheets");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/google-sheets/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5, `${n} pesa ${kb.toFixed(1)} KB: no parece una captura`);
            assert.ok(kb < 600, `${n} pesa ${kb.toFixed(0)} KB: demasiado para una página que se abre en el móvil`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("no publica el correo de VERDAD de la cuenta de servicio: el de las capturas es de ejemplo", () => {
        const lanzador = leer("scripts/generar-guia.sh");
        const correo = /"client_email":"([^"]+)"/.exec(lanzador)?.[1] ?? "";
        assert.match(correo, /@plataforma-ejemplo\./, `las capturas salen con «${correo}»`);
        const receta = leer("scripts/capturar-guia-google-sheets.mjs");
        assert.ok(!/iam\.gserviceaccount\.com/.test(receta.replace(correo, "")), "la receta escribe otro correo de servicio");
    });

    test("es PÚBLICA y NO se indexa, y no toca la base más que la de Leads", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/google-sheets/page.tsx", "app/guia/google-sheets/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/google-sheets/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deHojas = [["GOOGLE_SHEETS", "·"], ["GoogleSheets", "·"], ["Google Sheets", "·"], ["google-sheets", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/google-sheets/${rel}`), deHojas),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/google-sheets/${rel} no es la de Leads con otro nombre`,
            );
        }
    });

    test("su tarjeta sale sola en «Tutoriales del módulo» de /google-sheets, con título y descripción que cumplen", () => {
        const fila = tutoriales.GUIAS_PUBLICADAS.find((g) => g.modulo === "google-sheets");
        assert.ok(fila, "la guía no tiene su fila en GUIAS_PUBLICADAS");
        assert.equal(fila.ruta, "/google-sheets");
        const tarjeta = tutoriales.juntarLosTutoriales([], ["/google-sheets"]).find((t) => t.url === "/guia/google-sheets");
        assert.ok(tarjeta, "la ventana de /google-sheets no ofrece la guía");
        assert.equal(tarjeta.title, "Guía de Google Sheets");
        assert.equal(tutoriales.porQueNoValeLaDescripcion(tarjeta.description), null, `la descripción no cumple: «${tarjeta.description}»`);
        assert.ok(!/[[\]]/.test(tarjeta.description), "la descripción lleva corchetes literales");
        assert.ok(tarjeta.description.length <= 75, `${tarjeta.description.length} caracteres`);
        // Y la semilla de la guía usa ese mismo texto.
        assert.ok(leer("scripts/sembrar-guia-google-sheets.mjs").includes(tarjeta.description), "la semilla usa otra descripción");
    });
}
