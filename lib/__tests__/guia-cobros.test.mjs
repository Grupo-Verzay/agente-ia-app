/**
 * El banco de la GUÍA PÚBLICA de Cobros (`/guia/cobros`).
 *
 * Las mismas cosas que las demás guías, y por el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los filtros, las columnas, las
 *    opciones del «⋯» de una deuda, los campos de «Nuevo cobro», los de la
 *    configuración y los tres avisos salen de `lib/pantalla-de-cobros.ts`, y la
 *    pantalla (`CobrosClient.tsx`, `FormularioDeCobro.tsx`,
 *    `ConfiguracionDeCobros.tsx`) tiene que pintarlos en ese orden.
 * 2. **Lo que se confirma, se confirma**: confirmar el pago y eliminar pasan por
 *    una ventana con «Volver».
 * 3. **Cada imagen que la guía enseña existe**, y no sobra ninguna.
 * 4. **Es pública, no toca la base y sus dos páginas son las de Leads** con otro
 *    nombre, letra por letra.
 * 5. **Su tarjeta en «Tutoriales del módulo»**.
 *
 * `MODO=roto` lee los ficheros de `ANTES_COBROS_REF` —pinchado, nunca
 * `origin/main`— y afirma que no había guía, ni marcas en la pantalla, ni
 * confirmación al confirmar un pago.
 *
 * Se levanta con `scripts/banco-guia-cobros.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_COBROS_REF ?? "84f98e5";

const PANTALLA = "app/(root)/cobros/_components/CobrosClient.tsx";
const FORMULARIO = "app/(root)/cobros/_components/FormularioDeCobro.tsx";
const AJUSTES = "app/(root)/cobros/_components/ConfiguracionDeCobros.tsx";

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
    test("ANTES no había guía pública de Cobros", () => {
        assert.equal(leer("lib/guia-cobros.ts"), "", "lib/guia-cobros.ts ya existía");
        assert.equal(leer("app/guia/cobros/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_COBROS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/modulo: "cobros"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba");
    });

    test("ANTES la pantalla no exponía sus marcas", () => {
        for (const marca of ['data-zona="cartera"', "data-fila-de-cobro", "data-filtro"]) {
            assert.ok(!leer(PANTALLA).includes(marca), `la pantalla ya tenía «${marca}»`);
        }
        assert.ok(!leer(FORMULARIO).includes("data-campo"), "el formulario ya tenía sus marcas");
        assert.ok(!leer(AJUSTES).includes("data-campo"), "la configuración ya tenía sus marcas");
        assert.equal(leer("lib/pantalla-de-cobros.ts"), "", "los nombres compartidos ya existían");
    });

    test("ANTES confirmar un pago no pedía confirmación", () => {
        assert.ok(!leer(PANTALLA).includes('"confirmar"'), "confirmar ya pasaba por una ventana");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-cobros/guia-cobros.mjs"));
    const todo = guia.GUIA_COBROS.secciones.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const pantalla = leer(PANTALLA);

    test("los filtros, las columnas y las opciones salen de los nombres compartidos", () => {
        assert.match(pantalla, /from "@\/lib\/pantalla-de-cobros"/);
        assert.deepEqual([...guia.FILTROS_DOCUMENTADOS], ["Todos", "Comprobantes", "Vencidas", "Por vencer", "Al día"]);
        assert.match(pantalla, /data-filtro=\{f\.clave\}/);
        assert.match(pantalla, /COLUMNAS_DE_LA_CARTERA\.map/);
        assert.deepEqual([...guia.COLUMNAS_DOCUMENTADAS], ["Cliente", "Concepto", "Monto", "Vence", "Estado", "Ciclo"]);
        for (const z of ["cliente", "concepto", "monto", "vence", "estado", "ciclo", "mandos"]) assert.ok(pantalla.includes(`data-zona="${z}"`), `falta la celda «${z}»`);
        for (const o of ["cobrar", "comprobante", "volver", "confirmar", "historial", "editar", "eliminar"]) {
            assert.ok(pantalla.includes(`OPCIONES_DE_UNA_DEUDA.${o}`), `el menú no pinta «${o}» desde los nombres compartidos`);
        }
        for (const x of [...guia.FILTROS_DOCUMENTADOS, ...guia.COLUMNAS_DOCUMENTADAS, ...guia.OPCIONES_DOCUMENTADAS, "No era: volver a pendiente"]) {
            assert.ok(todo.includes(x), `la guía no nombra «${x}»`);
        }
    });

    test("la barra de trabajo: buscador, filtros, Actualizar, Configuración y Nuevo", () => {
        assert.deepEqual(guia.PARTES_DE_LA_BARRA_DE_TRABAJO.map((p) => p.nombre), ["Buscador", "Filtros por situación", "Actualizar", "Configuración", "Nuevo"]);
        assert.match(pantalla, /placeholder="Buscar cliente…"/);
        assert.match(pantalla, /aria-label="Actualizar"/);
        assert.match(pantalla, /aria-label="Configuración de cobros"/);
        assert.match(pantalla, />Nuevo<\/BotonDeCrear>/);
        const barra = guia.GUIA_COBROS.secciones[0].pasos.find((p) => p.imagen === "barra.webp").texto;
        guia.PARTES_DE_LA_BARRA_DE_TRABAJO.forEach((p, i) => assert.ok(barra.includes(`${i + 1} ${p.nombre}`), `la barra no numera «${p.nombre}» como ${i + 1}`));
        const fila = guia.GUIA_COBROS.secciones[0].pasos.find((p) => p.imagen === "fila.webp").texto;
        guia.COLUMNAS_DOCUMENTADAS.forEach((c, i) => assert.ok(fila.includes(`${i + 1} ${c}`), `la fila no numera «${c}» como ${i + 1}`));
    });

    test("los campos de «Nuevo cobro» son los del formulario, en su orden", () => {
        const campos = [...leer(FORMULARIO).matchAll(/data-campo="([a-zA-Z]+)"/g)].map((m) => m[1]);
        assert.deepEqual(campos, ["cliente", "whatsapp", "concepto", "monto", "moneda", "vence", "licencia", "gracia", "adjuntos", "nota"]);
        assert.deepEqual([...guia.CAMPOS_DOCUMENTADOS].length, campos.length);
        for (const c of ["Cuenta de cobro", "datos de pago"]) assert.ok(todo.toLowerCase().includes(c.toLowerCase()), `la guía no habla de «${c}»`);
    });

    test("la configuración: cómo te pagan, cuándo (antes, el día, después) y los tres mensajes", () => {
        const ajustes = leer(AJUSTES);
        const campos = [...ajustes.matchAll(/data-campo="([a-zA-Z]+)"/g)].map((m) => m[1]);
        assert.deepEqual(campos, ["pago", "antes", "elDia", "despues", "mensajes"]);
        assert.match(ajustes, /data-zona="cuando"/);
        assert.match(ajustes, /data-mensaje=\{hito\}/);
        assert.match(ajustes, /TITULO_DEL_AVISO/);
        assert.deepEqual([...guia.AVISOS_DOCUMENTADOS], ["Días antes de vencer", "El día del vencimiento", "Días después de vencido"]);
        for (const x of [...guia.AVISOS_DOCUMENTADOS, ...guia.VARIABLES_DOCUMENTADAS]) assert.ok(todo.includes(x), `la guía no nombra «${x}»`);
    });

    test("confirmar el pago y eliminar se CONFIRMAN, con «Volver»", () => {
        assert.match(pantalla, /data-confirmar=\{porConfirmar\?\.que\}/);
        assert.match(pantalla, /<AlertDialogCancel>Volver<\/AlertDialogCancel>/);
        assert.match(pantalla, /"Sí, confirmar el pago"/);
        assert.ok(todo.includes("Volver"), "la guía no dice cómo salir sin cambiar nada");
    });

    test("el guion de capturas no pulsa «Cobrar ahora» ni guarda la configuración", () => {
        const receta = readFileSync(path.join(RAIZ, "scripts/capturar-guia-cobros.mjs"), "utf8");
        assert.ok(!/laOpcion\(p, "Cobrar ahora"\)\)?\.click\(\)/.test(receta), "la receta pulsa Cobrar ahora");
        assert.ok(!/pulsar\(p, laOpcion\(p, "Cobrar ahora"\)\)/.test(receta), "el vídeo pulsa Cobrar ahora");
        assert.ok(!/LA_VENTANA_DE_AJUSTES\)?\.getByRole\("button", \{ name: "Guardar" \}\)\.click/.test(receta), "la receta guarda la configuración");
        assert.ok(!/eliminar\.getByRole\("button", \{ name: "Eliminar" \}\)\.click/.test(receta), "la receta confirma un borrado");
    });

    test("la guía cubre todos los apartados, y cada sección tiene su página", () => {
        const slugs = guia.GUIA_COBROS.secciones.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "cartera", "cobrar-ahora", "comprobante", "confirmar-pago", "historial", "crear", "editar-y-eliminar", "recordatorios", "mensajes"]);
        const pagina = leer("app/guia/cobros/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.GUIA.laSeccion("no-existe"), null);
        assert.equal(guia.GUIA.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.GUIA.lasVecinas("mensajes").siguiente, null);
        for (const s of guia.GUIA_COBROS.secciones) {
            assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
            assert.ok(s.pasos.length >= 2, `${s.slug}: menos de dos pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 220, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"cobros"/);
        assert.equal(guia.MODULO_DE_COBROS, "Panel");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "cobros");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.GUIA.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/cobros/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5, `${n} pesa ${kb.toFixed(1)} KB: no parece una captura`);
            assert.ok(kb < 600, `${n} pesa ${kb.toFixed(0)} KB`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA, no toca la base, y sus páginas son las de Leads con otro nombre", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/cobros/page.tsx", "app/guia/cobros/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deCobros = [["COBROS", "·"], ["Cobros", "·"], ["cobros", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/cobros/${rel}`), deCobros), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/cobros/${rel} no es la de Leads con otro nombre`);
        }
    });

    test("su tarjeta en «Tutoriales del módulo»", () => {
        const fila = /\{\s*modulo: "cobros",\s*ruta: "([^"]+)",\s*contenido: GUIA_COBROS,\s*tarjeta: "([^"]+)",?\s*\}/.exec(leer("lib/tutoriales-del-modulo.ts"));
        assert.ok(fila, "falta la fila de Cobros en GUIAS_PUBLICADAS");
        assert.equal(fila[1], "/cobros");
        assert.match(fila[2], /^Aprende a .+ en la plataforma$/);
        assert.ok([...fila[2]].length <= 75, `la descripción mide ${[...fila[2]].length} caracteres`);
    });
}
