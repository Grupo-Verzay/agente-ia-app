/**
 * El banco de la GUÍA PÚBLICA de Correos (`/guia/correo`).
 *
 * Las mismas cuatro cosas que las demás guías:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las pastillas, la flecha,
 *    «Buscar en», las formas de conectar, el formulario de dominio propio, la
 *    barra de la selección, los tres «⋯», los mandos del correo abierto y la
 *    barra de responder se leen de `lib/correo.ts` y de los componentes de
 *    `/correo`. Un mando nuevo sin su nombre en la guía pone esto en rojo.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, y no lleva datos reales.
 * 4. **Es simétrica con Leads**: sus dos páginas son las de Leads con otro
 *    nombre, letra por letra.
 *
 * `MODO=roto` lee `ANTES_CORREO_REF` —pinchado a un commit— y afirma que no
 * había guía de Correos. Se levanta con `scripts/banco-guia-correo.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_CORREO_REF ?? "400482e";

const PANTALLA = "app/(root)/correo/_components";
const CLIENTE = `${PANTALLA}/CorreoClient.tsx`;
const CONECTAR = `${PANTALLA}/ConectarCorreo.tsx`;
const FILA = `${PANTALLA}/FilaDeCorreo.tsx`;
const LECTURA = `${PANTALLA}/LecturaDelCorreo.tsx`;
const PIEZAS = `${PANTALLA}/PiezasDeEscribir.tsx`;
const BULK = "app/(root)/chats/_components/BulkActionBar.tsx";

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

if (ROTO) {
    test("ANTES no había guía pública de Correos", () => {
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_CORREO_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.equal(leer("lib/guia-correo.ts"), "", "lib/guia-correo.ts ya existía");
        assert.equal(leer("app/guia/correo/page.tsx"), "", "la página ya existía");
        assert.ok(!/"correo"/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/ruta:\s*"\/correo"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-correo/guia-correo.mjs"));
    const correo = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-correo/correo.mjs"));
    const todo = guia.SECCIONES.flatMap((s) => [s.titulo, s.resumen, ...s.pasos.map((p) => `${p.titulo} ${p.texto}`), ...(s.consejos ?? [])]).join(" \n ");
    const cliente = leer(CLIENTE);
    const nombra = (lista) => { for (const x of lista) assert.ok(todo.includes(x), `ningún paso nombra «${x}»`); };

    test("las pastillas son las de la pantalla, en su orden, y la flecha lleva lo demás", () => {
        assert.deepEqual([...guia.PASTILLAS_DOCUMENTADAS], correo.FILTROS_EN_PASTILLA.map((f) => correo.NOMBRE_DEL_FILTRO[f]));
        assert.deepEqual([...guia.MENU_DE_LA_FLECHA].slice(1, -1), correo.FILTROS_EN_LA_FLECHA.map((f) => correo.NOMBRE_DEL_FILTRO[f]));
        assert.match(cliente, /FILTROS_EN_PASTILLA\.map/);
        assert.ok(cliente.indexOf("data-nuevo-correo") < cliente.indexOf("FILTROS_EN_LA_FLECHA.map"), "«Nuevo correo» ya no es el primero de la flecha");
        nombra(guia.PASTILLAS_DOCUMENTADAS);
        nombra(guia.MENU_DE_LA_FLECHA);
    });

    test("«Buscar en» son los campos de `NOMBRE_DEL_CAMPO`", () => {
        assert.deepEqual([...guia.CAMPOS_DEL_BUSCADOR], correo.CAMPOS_DE_BUSQUEDA.map((c) => correo.NOMBRE_DEL_CAMPO[c]));
        nombra(guia.CAMPOS_DEL_BUSCADOR);
    });

    test("las tres formas de conectar y los campos del dominio propio están en la ventana", () => {
        const c = leer(CONECTAR);
        let antes = -1;
        for (const f of guia.FORMAS_DE_CONECTAR) {
            const i = c.indexOf(f);
            assert.ok(i > antes, `la ventana no tiene «${f}» en ese orden`);
            antes = i;
        }
        for (const campo of new Set(guia.CAMPOS_DE_DOMINIO_PROPIO)) assert.ok(c.includes(campo), `el formulario no tiene «${campo}»`);
        nombra(guia.FORMAS_DE_CONECTAR);
        assert.match(todo, /IMAP/);
        assert.match(todo, /SMTP/);
    });

    test("los menús y la barra de la selección dicen lo que la guía", () => {
        const bulk = leer(BULK).replaceAll("${sustantivo.varios}", "correos");
        for (const a of guia.BARRA_DE_LA_SELECCION) assert.ok(bulk.includes(a) || cliente.includes(a), `la barra de la selección no tiene «${a}»`);
        for (const a of guia.MENU_DE_MAS_ACCIONES) assert.ok(cliente.includes(a), `el «⋯» no tiene «${a}»`);
        const fila = leer(FILA);
        for (const a of guia.MENU_DE_LA_FILA) assert.ok(fila.includes(a), `el «⋯» de la fila no tiene «${a}»`);
        const lectura = leer(LECTURA);
        for (const a of guia.MENU_DEL_CORREO_ABIERTO) assert.ok(lectura.includes(a), `el «⋯» del correo no tiene «${a}»`);
        for (const a of guia.MANDOS_DOCUMENTADOS.slice(0, -1)) assert.ok(lectura.includes(a), `la cabecera del correo no tiene «${a}»`);
        const escribir = leer(LECTURA) + leer(PIEZAS);
        for (const a of guia.PARTES_DE_LA_BARRA_DE_RESPONDER) assert.ok(escribir.includes(a), `la barra de responder no tiene «${a}»`);
        nombra(["leído", "Destacar", "Archivar", "Eliminar", "Exportar", "Responder", "Reenviar", "firma", "adjunt"]);
    });

    test("la imagen de los mandos los numera en su orden", () => {
        const texto = guia.laSeccion("leer").pasos.find((p) => p.imagen === "leer-mandos.webp").texto;
        guia.MANDOS_DOCUMENTADOS.forEach((m, i) => assert.ok(texto.includes(`${i + 1} ${m}`), `no numera «${m}» como ${i + 1}`));
        const pastillas = guia.laSeccion("filtros").pasos.find((p) => p.imagen === "filtros-pastillas.webp").texto;
        guia.PASTILLAS_DOCUMENTADAS.forEach((m, i) => assert.ok(pastillas.includes(`${i + 1} ${m}`), `no numera «${m}» como ${i + 1}`));
    });

    test("cubre lo que se pidió, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "conectar", "buzones", "buscar", "filtros", "seleccion", "leer", "responder", "reenviar", "nuevo-correo"]);
        for (const palabra of ["Gmail", "Outlook", "dominio propio", "varios buzones", "todas las bandejas", "firma"]) assert.ok(todo.toLowerCase().includes(palabra.toLowerCase()), `ningún paso habla de «${palabra}»`);
        const pagina = leer("app/guia/correo/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("nuevo-correo").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"correo"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /\bcorreo: \{ titulo: GUIA_CORREO\.titulo/);
    });

    test("cada paso es corto y tiene su texto alternativo", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("la tarjeta de «Tutoriales del módulo» sale sola en /correo", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{[^{}]*modulo:\s*"correo"[^{}]*\}/.exec(t)?.[0] ?? "";
        assert.ok(fila, "no hay fila de correo en GUIAS_PUBLICADAS");
        assert.match(fila, /ruta:\s*"\/correo"/);
        const tarjeta = /tarjeta:\s*"([^"]+)"/.exec(fila)?.[1] ?? "";
        assert.match(tarjeta, /^Aprende a [^[\]]+ en la plataforma$/);
        assert.ok([...tarjeta].length <= 75, `la descripción mide ${[...tarjeta].length} caracteres`);
        assert.ok(leer("scripts/sembrar-guia-correo.mjs").includes(`description: "${tarjeta}"`), "la semilla dice otra descripción");
        assert.match(leer("lib/navigation-routes.ts"), /correo/);
    });

    test("la semilla solo usa datos de ejemplo", () => {
        const s = leer("scripts/sembrar-guia-correo.mjs");
        // «verzay-correo» es la etiqueta del HKDF con la que la App sella las
        // credenciales: un nombre fijo del código, no un dato de nadie.
        const sinLaEtiqueta = (t) => t.replaceAll('"verzay-correo"', "");
        for (const f of ["scripts/sembrar-guia-correo.mjs", "scripts/guia-correo-datos.mjs", "scripts/fingido-guia-correo.mjs"]) {
            assert.doesNotMatch(sinLaEtiqueta(leer(f)), /@gmail|verzay|ia-app\.com|@hotmail|@outlook\.com/i, `${f} lleva datos que parecen reales`);
        }
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "correo");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/correo/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5 && kb < 600, `${n} pesa ${kb.toFixed(1)} KB`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA y NO se indexa", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/correo/page.tsx", "app/guia/correo/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deCorreo = [["CORREO", "·"], ["Correos", "·"], ["Correo", "·"], ["correo", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/correo/${rel}`), deCorreo), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/correo/${rel} no es la de Leads con otro nombre`);
        }
    });
}
