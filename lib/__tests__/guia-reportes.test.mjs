/**
 * El banco de la GUÍA PÚBLICA de Reportes (`/guia/reportes`).
 *
 * Las mismas cosas que las demás guías, y por el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las pestañas del CRM, los
 *    botones de la barra, los bloques de un reporte abierto, las métricas, las
 *    columnas del Excel, los periodos de «Lo que la IA no supo responder», los
 *    tipos y columnas de Registros, el menú de un registro y las columnas de
 *    Calidad se leen de `CrmDashboard.tsx`, `WeeklyReportsView.tsx`,
 *    `LoQueLaIaNoSupoView.tsx`, `records-table/*` y `CalidadView.tsx`.
 * 2. **La pantalla expone las marcas que usa la receta** (`data-zona`,
 *    `data-boton`, `data-pestana`) y borrar se CONFIRMA con «Volver».
 * 3. **Cada imagen que la guía enseña existe**, y no sobra ninguna.
 * 4. **Es pública y sus dos páginas son las de Leads** con otro nombre.
 * 5. **Su tarjeta en «Tutoriales del módulo»**.
 *
 * `MODO=roto` lee los ficheros de `ANTES_REPORTES_REF` —pinchado, nunca
 * `origin/main`— y afirma que no había guía ni marcas en la pantalla.
 *
 * Se levanta con `scripts/banco-guia-reportes.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REPORTES_REF ?? "84f98e5";

const D = "app/(root)/crm/dashboard/components";
const TABLERO = `${D}/CrmDashboard.tsx`;
const REPORTES = `${D}/WeeklyReportsView.tsx`;
const SIN_RESPUESTA = `${D}/LoQueLaIaNoSupoView.tsx`;
const CALIDAD = `${D}/CalidadView.tsx`;
const CONSTANTES = `${D}/records-table/constants.ts`;
const ACCIONES = `${D}/records-table/CrmRecordActionsCell.tsx`;

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
    test("ANTES no había guía pública de Reportes", () => {
        assert.equal(leer("lib/guia-reportes.ts"), "", "lib/guia-reportes.ts ya existía");
        assert.equal(leer("app/guia/reportes/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_REPORTES_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/modulo: "reportes"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba");
    });

    test("ANTES la pantalla no exponía sus marcas, y borrar no decía «Volver»", () => {
        assert.ok(!leer(REPORTES).includes('data-zona="barra-de-reportes"'), "la barra ya tenía su marca");
        assert.ok(!leer(REPORTES).includes("data-confirmar-borrado"), "la confirmación ya tenía su marca");
        assert.ok(!leer(SIN_RESPUESTA).includes("data-pregunta"), "las preguntas ya tenían su marca");
        assert.ok(!leer(TABLERO).includes("data-pestanas-del-crm"), "las pestañas del CRM ya tenían su marca");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-reportes/guia-reportes.mjs"));
    const todo = guia.GUIA_REPORTES.secciones.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const reportes = leer(REPORTES);
    const nombra = (lista, donde = todo) => {
        for (const x of lista) assert.ok(donde.includes(x), `la guía no nombra «${x}»`);
    };

    test("las pestañas del CRM son las del tablero, en su orden", () => {
        const tablero = leer(TABLERO);
        const enOrden = [...tablero.matchAll(/data-pestana="([a-z]+)"/g)].map((m) => m[1]);
        assert.deepEqual([...new Set(enOrden)], guia.PESTANAS_DEL_CRM.map((p) => p.pestana));
        assert.match(tablero, /data-pestanas-del-crm/);
        nombra(guia.PESTANAS_DEL_CRM.map((p) => p.nombre));
    });

    test("la barra de los reportes: sus botones, en su orden", () => {
        const barra = reportes.slice(reportes.indexOf('data-zona="barra-de-reportes"'));
        const botones = [...barra.matchAll(/data-boton="([a-z-]+)"/g)].map((m) => m[1]).slice(0, 4);
        assert.deepEqual(botones, guia.BOTONES_DE_LA_BARRA.map((b) => b.boton));
        nombra(guia.BOTONES_DE_LA_BARRA.map((b) => b.nombre));
    });

    test("un reporte abierto: sus bloques y sus cuatro cifras, como los pinta la pantalla", () => {
        let desde = 0;
        for (const b of guia.BLOQUES_DE_UN_REPORTE) {
            const i = reportes.indexOf(b, desde);
            assert.ok(i >= 0, `la pantalla no pinta «${b}» (o no en este orden)`);
            desde = i;
        }
        for (const m of guia.METRICAS_DE_LA_SEMANA) assert.ok(reportes.includes(`label="${m}"`), `no hay cifra «${m}»`);
        nombra(guia.METRICAS_DE_LA_SEMANA);
        for (const z of ["cabecera-del-reporte", "cifras-del-reporte", "enviado", "eliminar-reporte", "resumen", "metricas", "puntuacion", "actividad"]) {
            assert.ok(reportes.includes(`data-zona="${z}"`), `falta data-zona="${z}"`);
        }
    });

    test("Exportar: las columnas del Excel son las del código", () => {
        const exp = reportes.slice(reportes.indexOf("const handleExport"), reportes.indexOf("json_to_sheet"));
        const columnas = [...exp.matchAll(/^\s*'?([^':\n]+?)'?:\s/gm)].map((m) => m[1].trim()).filter((c) => !/^(const|rows)$/.test(c));
        assert.deepEqual(columnas, [...guia.COLUMNAS_DEL_EXCEL]);
    });

    test("borrar se CONFIRMA, uno o todos, con «Volver» para no borrar nada", () => {
        assert.match(reportes, /data-confirmar-borrado/);
        assert.match(reportes, /¿Eliminar este reporte\?/);
        assert.match(reportes, /¿Eliminar todos los reportes\?/);
        assert.match(reportes, /Volver/);
        assert.ok(todo.includes("Volver"), "la guía no dice cómo salir sin borrar");
    });

    test("Lo que la IA no supo responder: periodos, preguntas, veces y variantes", () => {
        const s = leer(SIN_RESPUESTA);
        for (const p of guia.PERIODOS_SIN_RESPUESTA) assert.ok(s.includes(p), `la pantalla no ofrece «${p}»`);
        nombra(guia.PERIODOS_SIN_RESPUESTA);
        for (const z of ["cabecera-sin-respuesta", "periodos-sin-respuesta", "lista-sin-respuesta", "veces", "detalle-de-la-pregunta", "variantes"]) {
            assert.ok(s.includes(`data-zona="${z}"`), `falta data-zona="${z}"`);
        }
        assert.match(s, /data-pregunta/);
    });

    test("Registros: los tipos, las columnas y el menú de un registro son los del código", () => {
        const c = leer(CONSTANTES);
        const tabs = [...c.slice(c.indexOf("CRM_TABS"), c.indexOf("] as const")).matchAll(/"([A-Z]+)"/g)].map((m) => m[1]);
        assert.equal(tabs.length, guia.TIPOS_DE_REGISTRO.length);
        const etiquetas = leer("app/(root)/crm/helpers/getTipoLabel.ts");
        const nombres = tabs.map((t) => (t === "TODOS" ? "Todos" : new RegExp(`case "${t}":\\s*return "([^"]+)"`).exec(etiquetas)?.[1]));
        assert.deepEqual(nombres, [...guia.TIPOS_DE_REGISTRO]);
        const columnas = [...c.slice(c.indexOf("CRM_TABLE_COLUMN_LABELS"), c.indexOf("CRM_DEFAULT_COLUMN_VISIBILITY")).matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(columnas, [...guia.COLUMNAS_DE_REGISTROS]);
        const acciones = leer(ACCIONES);
        let desde = 0;
        for (const a of guia.ACCIONES_DE_UN_REGISTRO) {
            const i = acciones.indexOf(a, desde);
            assert.ok(i >= 0, `el menú no ofrece «${a}» (o no en este orden)`);
            desde = i;
        }
        nombra(guia.TIPOS_DE_REGISTRO.filter((t) => t !== "Todos").map((t) => t.toLowerCase()), todo.toLowerCase());
    });

    test("Calidad: periodos y columnas de las dos tablas, y la fila de un asesor filtra", () => {
        const s = leer(CALIDAD);
        for (const p of guia.PERIODOS_DE_CALIDAD) assert.ok(s.includes(p), `Calidad no ofrece «${p}»`);
        const asesor = s.slice(s.indexOf("data-calidad-por-asesor"));
        const cols1 = [...asesor.slice(0, asesor.indexOf("</TableRow>")).matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)].map((m) => m[1].trim());
        assert.deepEqual(cols1, [...guia.COLUMNAS_POR_ASESOR]);
        const conv = s.slice(s.indexOf("data-calidad-conversaciones"));
        const cols2 = [...conv.slice(0, conv.indexOf("</TableRow>")).matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)].map((m) => m[1].trim());
        assert.deepEqual(cols2, [...guia.COLUMNAS_DE_CONVERSACIONES]);
        assert.match(s, /data-fila-asesor/);
        assert.match(s, /data-filtro-asesor/);
        nombra(["A mejorar", "Evaluar ahora"]);
    });

    test("la guía cubre los apartados pedidos, y cada sección tiene su página", () => {
        const slugs = guia.GUIA_REPORTES.secciones.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "generar", "leer", "whatsapp", "exportar", "borrar", "ia-no-supo", "registros", "calidad-por-asesor", "calidad-por-conversacion"]);
        const pagina = leer("app/guia/reportes/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.GUIA.laSeccion("no-existe"), null);
        assert.equal(guia.GUIA.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.GUIA.lasVecinas("calidad-por-conversacion").siguiente, null);
        for (const s of guia.GUIA_REPORTES.secciones) {
            assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 220, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"reportes"/);
        assert.equal(guia.MODULO_DE_REPORTES, "Panel");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "reportes");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.GUIA.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/reportes/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 3, `${n} pesa ${kb.toFixed(1)} KB: no parece una captura`);
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
        for (const f of ["app/guia/reportes/page.tsx", "app/guia/reportes/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deReportes = [["REPORTES", "·"], ["Reportes", "·"], ["reportes", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/reportes/${rel}`), deReportes), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/reportes/${rel} no es la de Leads con otro nombre`);
        }
    });

    test("su tarjeta en «Tutoriales del módulo»", () => {
        const fila = /\{\s*modulo: "reportes",\s*ruta: "([^"]+)",\s*contenido: GUIA_REPORTES,\s*tarjeta: "([^"]+)",?\s*\}/.exec(leer("lib/tutoriales-del-modulo.ts"));
        assert.ok(fila, "falta la fila de Reportes en GUIAS_PUBLICADAS");
        assert.equal(fila[1], "/crm/reportes");
        assert.match(fila[2], /^Aprende a .+ en la plataforma$/);
        assert.ok([...fila[2]].length <= 75, `la descripción mide ${[...fila[2]].length} caracteres`);
    });
}
