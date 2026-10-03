/**
 * El banco de la GUÍA PÚBLICA de Multiagenda (`/guia/multiagenda`).
 *
 * Las mismas cuatro cosas que las demás guías:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las pestañas, las cifras, las
 *    vistas y columnas del calendario, los estados (desplegable de la ficha y
 *    columnas del Kanban), los bloques de un especialista y sus mandos, los
 *    campos de un servicio, los archivos de un recordatorio, las tarjetas de
 *    Ajustes y los pasos de la página pública se leen del CÓDIGO.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa.**
 * 4. **Es simétrica con Leads**: sus dos páginas son las de Leads con otro
 *    nombre, letra por letra.
 *
 * Y lo que se arregló en la pantalla al documentarla: el enlace público sale
 * del dominio de la página DESPUÉS de montar (antes se leía al pintar y el
 * servidor y el navegador no coincidían), copiar va en su `try`, borrar un
 * recordatorio pide confirmación, la insignia cuenta DÍAS y no franjas, y el
 * archivo de un recordatorio de servicio se manda (antes salía solo el texto).
 *
 * `MODO=roto` lee `ANTES_MULTIAGENDA_REF` —pinchado a un commit— y afirma que
 * no había guía, ni marcas, y esos fallos.
 *
 * Se levanta con `scripts/banco-guia-multiagenda.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_MULTIAGENDA_REF ?? "400482e";

const D = "app/(root)/bookings/_components";
const MAIN = `${D}/MainBookings.tsx`;
const CALENDARIO = `${D}/dashboard/BookingsDashboardCalendar.tsx`;
const KANBAN = `${D}/dashboard/BookingsKanban.tsx`;
const ESPECIALISTAS = `${D}/members/MembersManager.tsx`;
const SERVICIOS = `${D}/services/BookingServicesManager.tsx`;
const RECORDATORIOS = `${D}/reminders/BookingsRemindersManager.tsx`;
const AJUSTES = `${D}/settings/BookingTeamSettings.tsx`;
const PUBLICA = "app/bookings/[userId]/_components/BookingPageClient.tsx";

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

const losRotulos = (fuente, desde, hasta) => {
    const i = fuente.indexOf(desde);
    if (i < 0) return [];
    const trozo = fuente.slice(i, fuente.indexOf(hasta, i));
    return [...trozo.matchAll(/label:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
};

if (ROTO) {
    test("ANTES no había guía pública de Multiagenda", () => {
        assert.equal(leer("lib/guia-multiagenda.ts"), "", "lib/guia-multiagenda.ts ya existía");
        assert.equal(leer("app/guia/multiagenda/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_MULTIAGENDA_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/"multiagenda"/.test(leer("lib/introduccion-de-la-guia.ts")));
        assert.ok(!/modulo:\s*"multiagenda"/.test(leer("lib/tutoriales-del-modulo.ts")));
    });

    test("ANTES la pantalla no exponía marcas para una receta", () => {
        for (const [f, marca] of [
            [MAIN, "data-pestana-de-multiagenda"],
            [ESPECIALISTAS, "data-bloque-del-especialista"],
            [PUBLICA, "data-paso-de-la-reserva"],
        ]) {
            assert.ok(!leer(f).includes(marca), `${f} ya tenía «${marca}»`);
        }
    });

    test("ANTES: enlace leído al pintar, copiar sin try, borrar sin confirmar, franjas por días y archivos sin mandar", () => {
        const ajustes = leer(AJUSTES);
        assert.match(ajustes, /window\.location\.origin\}\/bookings/);
        assert.doesNotMatch(ajustes, /try\s*\{[\s\S]*clipboard/);
        assert.doesNotMatch(leer(RECORDATORIOS), /AlertDialog/);
        assert.match(leer(ESPECIALISTAS), /availability\.length\} día\(s\)/);
        assert.doesNotMatch(leer("lib/recordatorios-de-la-reserva.ts"), /seguimiento-/);
    });
    test("ANTES el calendario daba el día ANTERIOR: startOfDay sobre la fecha UTC-coercionada", () => {
        const cal = leer("app/(root)/bookings/_components/dashboard/BookingsDashboardCalendar.tsx");
        assert.match(cal, /startOfDay\(info\.start\)/);
        assert.match(cal, /timeZone=\{timezone\}/);
        assert.match(cal, /new Date\(a\.startTime\)\.toISOString\(\)/);
        // Lo que hacía, en un navegador de Bogotá: el «2 de octubre» de FullCalendar es 2026-10-02T00:00Z.
        const inicio = new Date("2026-10-02T00:00:00Z");
        const local = new Date(inicio.getTime() - 5 * 3600 * 1000); // la medianoche local de Bogotá cae el 1
        assert.equal(local.toISOString().slice(0, 10), "2026-10-01");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-multiagenda/guia-multiagenda.mjs"));
    const pantalla = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-multiagenda/pantalla-de-multiagenda.mjs"));
    const recordatorios = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-multiagenda/recordatorios-de-la-reserva.mjs"));
    const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const nombra = (lista, que) => {
        for (const x of lista) assert.ok(todo.includes(x), `ningún paso nombra ${que} «${x}»`);
    };

    test("las pestañas son las de la pantalla, en su orden", () => {
        assert.deepEqual([...guia.PESTANAS_DOCUMENTADAS], ["Dashboard", "Kanban", "Especialistas", "Servicios", "Recordatorios", "Formulario", "Ajustes"]);
        assert.match(leer(MAIN), /PESTANAS_DE_MULTIAGENDA/, "la pantalla no lee sus pestañas de la lista compartida");
        nombra(guia.PESTANAS_DOCUMENTADAS, "la pestaña");
    });

    test("las cifras son las de la pantalla", () => {
        const main = leer(MAIN);
        const fijas = /const FIXED_METRICS[^=]*= \[([^\]]+)\]/.exec(main)?.[1].match(/'([A-Z_]+)'/g).map((s) => s.slice(1, -1)) ?? [];
        const meta = Object.fromEntries([...main.matchAll(/([A-Z_]+):\s*\{ label: '([^']+)'/g)].map((m) => [m[1], m[2]]));
        assert.deepEqual([...guia.CIFRAS_DOCUMENTADAS], fijas.map((f) => meta[f]));
        nombra(guia.CIFRAS_DOCUMENTADAS, "la cifra");
    });

    test("los estados: los del desplegable de la ficha y las columnas del Kanban, iguales", () => {
        const delKanban = losRotulos(leer(KANBAN), "const COLUMNS", "];");
        assert.equal(delKanban.length, 7);
        assert.deepEqual([...guia.ESTADOS_DOCUMENTADOS], delKanban);
        const cal = leer(CALENDARIO);
        assert.match(cal, /ALL_STATUSES[^=]*= \['PENDIENTE', 'CONFIRMADA', 'ATENDIDA', 'NO_ASISTIDA', 'CANCELADA', 'FINALIZADO', 'DESCARTADO'\]/);
        nombra(guia.ESTADOS_DOCUMENTADOS, "el estado");
        assert.ok(todo.includes("Reagendar"));
    });

    test("el calendario: sus vistas y las columnas del día", () => {
        const cal = leer(CALENDARIO);
        for (const v of guia.VISTAS_DEL_CALENDARIO) assert.ok(cal.includes(`'${v}'`), `el calendario no tiene la vista «${v}»`);
        assert.deepEqual([...guia.COLUMNAS_DEL_DIA], losRotulos(cal, "columnas Mañana", "].map"));
        nombra(guia.VISTAS_DEL_CALENDARIO, "la vista");
        nombra(guia.COLUMNAS_DEL_DIA, "la columna");
    });

    test("un especialista: sus bloques, sus mandos y sus campos", () => {
        const m = leer(ESPECIALISTAS);
        for (const b of guia.BLOQUES_DEL_ESPECIALISTA) assert.ok(m.includes(b), `Especialistas no tiene «${b}»`);
        for (const x of guia.MANDOS_DE_UNA_FRANJA) assert.ok(m.includes(`title="${x}"`), `Especialistas no tiene «${x}»`);
        for (const c of guia.CAMPOS_DEL_ESPECIALISTA) assert.ok(m.includes(c), `Especialistas no tiene «${c}»`);
        nombra(guia.BLOQUES_DEL_ESPECIALISTA, "el bloque");
        nombra(guia.CAMPOS_DEL_ESPECIALISTA, "el campo");
    });

    test("servicios, recordatorios, ajustes y la reserva pública dicen lo que la pantalla", () => {
        const s = leer(SERVICIOS);
        for (const c of guia.CAMPOS_DEL_SERVICIO) assert.ok(s.includes(c), `Servicios no tiene «${c}»`);
        nombra(guia.CAMPOS_DEL_SERVICIO, "el campo");
        assert.deepEqual([...guia.ARCHIVOS_DEL_RECORDATORIO], losRotulos(leer(RECORDATORIOS), "type: 'image'", "];"));
        const a = leer(AJUSTES);
        for (const t of guia.TARJETAS_DE_AJUSTES) assert.ok(a.includes(t), `Ajustes no tiene «${t}»`);
        nombra(guia.TARJETAS_DE_AJUSTES, "la tarjeta");
        assert.deepEqual([...guia.PASOS_DE_LA_RESERVA], losRotulos(leer(PUBLICA), "const stepLabels", "];"));
        nombra(guia.PASOS_DE_LA_RESERVA, "el paso de la reserva");
    });

    test("el calendario enseña el día y la hora de la ZONA de la cuenta", async () => {
        const z = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-multiagenda/calendario-en-la-zona.mjs"));
        const tz = "America/Bogota";
        // El «2 de octubre» que manda FullCalendar (UTC-coercionado) es el 2 en la zona.
        const dia = z.elDiaDelCalendario(new Date("2026-10-02T00:00:00Z"), tz);
        assert.equal(dia.toISOString(), "2026-10-02T05:00:00.000Z");
        // Una cita de las 11:00 de Bogotá se le da a FullCalendar como 11:00, no como 16:00.
        assert.equal(z.laHoraDePared("2026-10-02T16:00:00Z", tz), "2026-10-02T11:00:00");
        // Hoy, a las 23:40 UTC, en Bogotá todavía es el 2.
        assert.equal(z.hoyEnLaZona(tz, new Date("2026-10-02T23:40:00Z")).toISOString(), "2026-10-02T05:00:00.000Z");
        const cal = leer("app/(root)/bookings/_components/dashboard/BookingsDashboardCalendar.tsx");
        assert.doesNotMatch(cal, /startOfDay\(info\.start\)/);
        assert.match(cal, /elDiaDelCalendario\(info\.start, timezone\)/);
        assert.match(cal, /laHoraDePared\(a\.startTime, timezone\)/);
        assert.match(cal, /now=\{/);
    });

    test("lo que se arregló en la pantalla al documentarla", () => {
        const a = leer(AJUSTES);
        assert.doesNotMatch(a, /agente\.ia-app\.com/);
        assert.match(a, /elEnlaceDeReservaDelEquipo/);
        assert.match(a, /try\s*\{[\s\S]*clipboard/, "copiar el enlace sin su try");
        assert.equal(pantalla.elEnlaceDeReservaDelEquipo("https://x.com/", "a b"), "https://x.com/bookings/a%20b");
        assert.match(leer(RECORDATORIOS), /AlertDialog/, "borrar un recordatorio vuelve a ser de un clic");
        const franjas = [1, 2, 3, 4, 5].flatMap((d) => [{ dayOfWeek: d }, { dayOfWeek: d }]);
        assert.equal(pantalla.losDiasQueAtiende(franjas), 5);
        assert.equal(pantalla.elRotuloDeLosDias(1), "1 día");
        assert.equal(pantalla.elRotuloDeLosDias(5), "5 días");
        assert.match(leer(ESPECIALISTAS), /elRotuloDeLosDias\(losDiasQueAtiende/);
        assert.deepEqual(recordatorios.elTipoDelSeguimiento({}), { tipo: "text", media: null });
        assert.deepEqual(recordatorios.elTipoDelSeguimiento({ media: "https://b/x.png", mediaType: "image" }), { tipo: "seguimiento-image", media: "https://b/x.png" });
        assert.deepEqual(recordatorios.elTipoDelSeguimiento({ media: "https://b/x.zip", mediaType: "raro" }), { tipo: "seguimiento-document", media: "https://b/x.zip" });
    });

    test("la guía cubre todos los apartados, y cada sección tiene su página", () => {
        assert.deepEqual(guia.SECCIONES.map((s) => s.slug), ["vista-general", "calendario", "estado-y-reagendar", "kanban", "especialistas", "servicios", "recordatorios", "formulario", "ajustes", "pagina-publica"]);
        const pagina = leer("app/guia/multiagenda/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.laSeccion("no-existe"), null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"multiagenda"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /multiagenda:/);
    });

    test("cada paso es corto", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 220, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("la tarjeta de «Tutoriales del módulo» sale sola en /bookings", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{[^{}]*modulo:\s*"multiagenda"[^{}]*\}/.exec(t)?.[0] ?? "";
        assert.ok(fila, "no hay fila de multiagenda en GUIAS_PUBLICADAS");
        assert.match(fila, /ruta:\s*"\/bookings"/);
        const tarjeta = /tarjeta:\s*"([^"]+)"/.exec(fila)?.[1] ?? "";
        assert.match(tarjeta, /^Aprende a [^[\]]+ en la plataforma$/);
        assert.ok([...tarjeta].length <= 75);
        assert.ok(leer("scripts/sembrar-guia-multiagenda.mjs").includes(`description: "${tarjeta}"`));
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "multiagenda");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/multiagenda/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5 && kb < 600, `${n} pesa ${kb.toFixed(1)} KB`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA, no se indexa, y la página de reserva tampoco pide sesión", () => {
        const mw = leer("middleware.ts");
        assert.match(mw, /currentPath\.startsWith\("\/guia\/"\)/);
        assert.match(mw, /"\/bookings\/"/);
        for (const f of ["app/guia/multiagenda/page.tsx", "app/guia/multiagenda/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deMulti = [["MULTIAGENDA", "·"], ["Multiagenda", "·"], ["multiagenda", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/multiagenda/${rel}`), deMulti), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/multiagenda/${rel} no es la de Leads con otro nombre`);
        }
    });
}
