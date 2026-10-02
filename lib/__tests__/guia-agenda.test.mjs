/**
 * El banco de la GUÍA PÚBLICA de Agenda (`/guia/agenda`).
 *
 * Las mismas cuatro cosas que las demás guías, y por el mismo motivo —se
 * rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las pestañas, las cifras, las
 *    vistas del calendario, los estados (desplegable de la ficha y columnas
 *    del Kanban), los mandos de un periodo, los botones del enlace, los pasos
 *    de la reserva pública, los tipos de pregunta, los campos de la reunión y
 *    los pasos de Google Calendar se leen del CÓDIGO. Uno nuevo sin su nombre
 *    en la guía pone esto en rojo.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra.
 *
 * Y lo que se arregló en la pantalla al documentarla: el enlace de reserva
 * sale del dominio de la página (estaba fijo en `agente.ia-app.com`), copiar
 * no revienta sin HTTPS, y la confirmación de cancelar dice qué hace.
 *
 * `MODO=roto` lee `ANTES_AGENDA_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía, ni marcas en la pantalla, y los
 * fallos de la pantalla.
 *
 * Se levanta con `scripts/banco-guia-agenda.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_AGENDA_REF ?? "2c7b35e";

const D = "app/(root)/schedule/_components";
const MAIN = `${D}/MainSchedule.tsx`;
const CALENDARIO = `${D}/dashboard/CustomCalendar.tsx`;
const KANBAN = `${D}/dashboard/AgendaKanban.tsx`;
const DISPONIBILIDAD = `${D}/availability/UserAvailabilityForm.tsx`;
const ENLACE = `${D}/availability/ShareScheduleLinkButton.tsx`;
const FORMULARIO = `${D}/form/BookingFormBuilder.tsx`;
const REUNION = `${D}/settings/UpdateMeetingDuration.tsx`;
const GOOGLE = `${D}/settings/GoogleCalendarSettings.tsx`;
const PUBLICA = "app/schedule/_components/SchedulePageClient.tsx";

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

/** Los `label` de un bloque del código, en su orden. */
const losRotulos = (fuente, desde, hasta) => {
    const i = fuente.indexOf(desde);
    if (i < 0) return [];
    const trozo = fuente.slice(i, fuente.indexOf(hasta, i));
    return [...trozo.matchAll(/label:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
};

if (ROTO) {
    test("ANTES no había guía pública de Agenda", () => {
        assert.equal(leer("lib/guia-agenda.ts"), "", "lib/guia-agenda.ts ya existía");
        assert.equal(leer("app/guia/agenda/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_AGENDA_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/"agenda"/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/modulo:\s*"agenda"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
    });

    test("ANTES la pantalla no exponía marcas para una receta", () => {
        for (const [f, marca] of [
            [MAIN, "data-pestana-de-agenda"],
            [CALENDARIO, "data-columna-del-dia"],
            [KANBAN, "data-columna-de-agenda"],
            [DISPONIBILIDAD, "data-dia-de-disponibilidad"],
            [ENLACE, "data-enlace-de-reserva"],
        ]) {
            assert.ok(!leer(f).includes(marca), `${f} ya tenía «${marca}»`);
        }
    });

    test("ANTES el enlace de reserva estaba fijo en un dominio, y la cancelación sin tilde", () => {
        assert.match(leer(ENLACE), /https:\/\/agente\.ia-app\.com\/schedule/);
        assert.match(leer(CALENDARIO), /Confirmar cancelacion/);
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-agenda/guia-agenda.mjs"));
    const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const nombra = (lista, que) => {
        for (const x of lista) assert.ok(todo.includes(x), `ningún paso nombra ${que} «${x}»`);
    };

    test("las pestañas son las de la pantalla, en su orden, y la guía las nombra", () => {
        const pantalla = leer("lib/pantalla-de-agenda.ts");
        const enCodigo = [...pantalla.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
        assert.equal(enCodigo.length, 8);
        assert.deepEqual([...guia.PESTANAS_DOCUMENTADAS], enCodigo);
        assert.match(leer(MAIN), /PESTANAS_DE_LA_AGENDA/, "la pantalla no lee sus pestañas de la lista compartida");
        nombra(guia.PESTANAS_DOCUMENTADAS, "la pestaña");
    });

    test("las cifras son las de la pantalla", () => {
        const main = leer(MAIN);
        const fijas = /const FIXED_METRICS[^=]*= \[([^\]]+)\]/.exec(main)?.[1].match(/'([A-Z_]+)'/g).map((s) => s.slice(1, -1)) ?? [];
        const meta = Object.fromEntries([...leer(CALENDARIO).matchAll(/([A-Z_]+):\s*\{ label: '([^']+)'/g)].map((m) => [m[1], m[2]]));
        assert.deepEqual([...guia.CIFRAS_DOCUMENTADAS], fijas.map((f) => meta[f]));
        assert.deepEqual([...guia.CIFRAS_DE_REGISTROS], [...main.slice(main.indexOf("const bookingMetrics")).matchAll(/label: '([^']+)'/g)].slice(0, 4).map((m) => m[1]));
        nombra(guia.CIFRAS_DE_REGISTROS, "la cifra");
    });

    test("los estados: los del desplegable de la ficha y las columnas del Kanban, iguales", () => {
        const deLaFicha = losRotulos(leer(CALENDARIO), "APPOINTMENT_STATUS_META", "};");
        const delKanban = losRotulos(leer(KANBAN), "const COLUMNS", "];");
        assert.equal(deLaFicha.length, 7);
        assert.deepEqual([...guia.ESTADOS_DOCUMENTADOS], deLaFicha);
        assert.deepEqual([...guia.ESTADOS_DOCUMENTADOS], delKanban);
        nombra(guia.ESTADOS_DOCUMENTADOS, "el estado");
        assert.ok(todo.includes("Reagendar"), "ningún paso nombra Reagendar");
    });

    test("el calendario, la disponibilidad y el enlace dicen lo que la pantalla", () => {
        const cal = leer(CALENDARIO);
        for (const v of guia.VISTAS_DEL_CALENDARIO) assert.match(cal, new RegExp(`'${v}'`), `el calendario no tiene la vista «${v}»`);
        nombra(guia.VISTAS_DEL_CALENDARIO, "la vista");
        const disp = leer(DISPONIBILIDAD);
        for (const m of guia.MANDOS_DE_UN_PERIODO) assert.ok(disp.includes(`title="${m}"`), `Disponibilidad no tiene «${m}»`);
        nombra(guia.MANDOS_DE_UN_PERIODO, "el mando");
        const enlace = leer(ENLACE);
        for (const b of guia.BOTONES_DEL_ENLACE) assert.ok(enlace.includes(b), `el enlace no tiene «${b}»`);
        nombra(guia.BOTONES_DEL_ENLACE, "el botón");
    });

    test("la reserva pública, el formulario y los ajustes dicen lo que la pantalla", () => {
        assert.deepEqual([...guia.PASOS_DE_LA_RESERVA], losRotulos(leer(PUBLICA), "const stepLabel", "];"));
        nombra(guia.PASOS_DE_LA_RESERVA, "el paso de la reserva");
        const form = leer(FORMULARIO);
        for (const t of guia.TIPOS_DE_PREGUNTA) assert.ok(form.includes(`'${t}'`), `el formulario no tiene el tipo «${t}»`);
        nombra(guia.TIPOS_DE_PREGUNTA, "el tipo");
        const reunion = leer(REUNION);
        for (const c of guia.CAMPOS_DE_LA_REUNION) assert.ok(reunion.includes(c), `Ajustes no tiene «${c}»`);
        nombra(guia.CAMPOS_DE_LA_REUNION, "el campo");
        const google = leer(GOOGLE);
        for (const c of guia.PASOS_DE_GOOGLE_CALENDAR) assert.ok(google.includes(c), `Google Calendar no tiene «${c}»`);
        assert.ok(todo.includes("Google Calendar"));
    });

    test("lo que se arregló en la pantalla al documentarla", () => {
        const enlace = leer(ENLACE);
        assert.doesNotMatch(enlace, /agente\.ia-app\.com/, "el enlace de reserva vuelve a estar fijo en un dominio");
        assert.match(enlace, /elEnlaceDeReserva/);
        assert.match(enlace, /try\s*\{[\s\S]*clipboard/, "copiar el enlace sin su try: sin HTTPS revienta");
        const cal = leer(CALENDARIO);
        assert.match(cal, /Confirmar cancelación/);
        assert.match(cal, /Sí, cancelar la cita/);
        assert.ok(!/Confirmar cancelacion\b/.test(cal));
    });

    test("la guía cubre todos los apartados, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "calendario", "estado-y-reagendar", "disponibilidad", "enlace-publico", "kanban", "servicios", "recordatorios", "formulario-y-registros", "ajustes"]);
        const pagina = leer("app/guia/agenda/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("ajustes").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"agenda"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /agenda:/);
    });

    test("cada paso es corto: la captura explica, el texto pone nombre", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 220, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("la tarjeta de «Tutoriales del módulo» sale sola en /schedule, con su descripción", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{[^{}]*modulo:\s*"agenda"[^{}]*\}/.exec(t)?.[0] ?? "";
        assert.ok(fila, "no hay fila de agenda en GUIAS_PUBLICADAS");
        assert.match(fila, /ruta:\s*"\/schedule"/);
        const tarjeta = /tarjeta:\s*"([^"]+)"/.exec(fila)?.[1] ?? "";
        assert.match(tarjeta, /^Aprende a [^[\]]+ en la plataforma$/);
        assert.ok([...tarjeta].length <= 75);
        assert.equal(guia.GUIA_AGENDA.titulo, "Agenda");
        assert.ok(leer("scripts/sembrar-guia-agenda.mjs").includes(`description: "${tarjeta}"`), "la semilla dice otra descripción");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "agenda");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/agenda/${n}`);
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

    test("es PÚBLICA y NO se indexa, y no toca la base más que la de Leads", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/agenda/page.tsx", "app/guia/agenda/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deAgenda = [["AGENDA", "·"], ["Agenda", "·"], ["agenda", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/agenda/${rel}`), deAgenda), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/agenda/${rel} no es la de Leads con otro nombre`);
        }
    });
}
