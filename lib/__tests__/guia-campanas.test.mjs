/**
 * El banco de la GUÍA PÚBLICA de Campañas (`/guia/campanas`).
 *
 * Las mismas cosas que las demás guías, y por el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las vistas, las cifras, las
 *    columnas del tablero, los archivos, las variables, los campos de la
 *    ventana en modo campaña, el panel de segmentación, las partes de una
 *    campaña, su historial, el aviso de riesgo y el «⋯» se leen de
 *    `MainReminders.tsx`, `ReminderForm.tsx`, `ReminderList.tsx`,
 *    `CampaignSegmentPanel.tsx` y `lib/campanas.ts`. Un mando nuevo sin su
 *    nombre en la guía pone esto en rojo.
 * 2. **Cada imagen que la guía enseña existe**, y no sobra ninguna.
 * 3. **Es pública, no se indexa y sus dos páginas son las de Leads** con otro
 *    nombre, letra por letra.
 * 4. **Su tarjeta en «Tutoriales del módulo»**.
 *
 * `MODO=roto` lee los ficheros de `ANTES_CAM_REF` —pinchado, nunca
 * `origin/main`— y afirma que no había guía ni marcas en la pantalla de
 * Campañas.
 *
 * Se levanta con `scripts/banco-guia-campanas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_CAM_REF ?? "ab6b110";

const PANTALLA = "app/(root)/reminders/_components/MainReminders.tsx";
const FORMULARIO = "app/(root)/reminders/_components/ReminderForm.tsx";
const LISTA = "app/(root)/reminders/_components/ReminderList.tsx";
const SEGMENTO = "app/(root)/campaigns/_components/CampaignSegmentPanel.tsx";

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
    test("ANTES no había guía pública de Campañas", () => {
        assert.equal(leer("lib/guia-campanas.ts"), "", "lib/guia-campanas.ts ya existía");
        assert.equal(leer("app/guia/campanas/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_CAM_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/modulo: "campanas"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba");
        assert.ok(!leer(SEGMENTO).includes("data-zona"), "el panel de segmentación ya tenía sus marcas");
        assert.ok(!leer(FORMULARIO).includes('data-campo="variables"'), "la ventana ya marcaba sus variables");
    });

    test("ANTES no había reglas de la campaña en lib/", () => {
        assert.equal(leer("lib/campanas.ts"), "", "lib/campanas.ts ya existía");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-campanas/guia-campanas.mjs"));
    const cam = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-campanas/campanas.mjs"));
    const todo = guia.GUIA_CAMPANAS.secciones.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const pasoDe = (imagen) => guia.GUIA_CAMPANAS.secciones.flatMap((s) => s.pasos).find((p) => p.imagen === imagen);

    test("la barra: las vistas, las cifras, el «Nuevo» y el «⋯» son los de la pantalla", () => {
        const pantalla = leer(PANTALLA);
        const vista = pantalla.slice(pantalla.indexOf('data-zona="vista"'));
        const botones = [...vista.slice(0, vista.indexOf("</div>")).matchAll(/\/>\s*(Lista|Kanban)\s*</g)].map((m) => m[1]);
        assert.deepEqual(botones, [...guia.VISTAS_DOCUMENTADAS]);
        const cifras = [...pantalla.slice(pantalla.indexOf("<PastillasDeMetricas")).matchAll(/etiqueta: '([^']+)'/g)].slice(0, 4).map((m) => m[1]);
        assert.deepEqual(cifras, [...guia.CIFRAS_DOCUMENTADAS]);
        const masivas = [...pantalla.matchAll(/etiqueta: "([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(masivas, [...guia.ACCIONES_MASIVAS_DOCUMENTADAS]);
        assert.match(pantalla, /<BotonDeCrear onClick=\{handleCreateReminder\}>Nuevo<\/BotonDeCrear>/);
        for (const p of guia.PARTES_DE_LA_BARRA_DE_TRABAJO) {
            if (["vista", "cifras"].includes(p.zona)) assert.ok(pantalla.includes(`data-zona="${p.zona}"`), `falta data-zona="${p.zona}"`);
        }
        guia.CIFRAS_DOCUMENTADAS.forEach((c, i) => assert.ok(pasoDe("lista-cifras.webp").texto.includes(`${i + 1} ${c}`), `las cifras no numeran «${c}»`));
    });

    test("las columnas del tablero son las de la pantalla, en su orden y numeradas", () => {
        const columnas = [...leer(PANTALLA).matchAll(/\{ key: '[a-z]+', label: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual(columnas, [...guia.COLUMNAS_DOCUMENTADAS]);
        const kanban = guia.GUIA_CAMPANAS.secciones.find((s) => s.slug === "kanban").pasos.map((p) => p.texto).join(" ");
        guia.COLUMNAS_DOCUMENTADAS.forEach((c, i) => assert.ok(kanban.includes(`${i + 1} ${c}`), `el tablero no numera «${c}» como ${i + 1}`));
    });

    test("la ventana en modo campaña: sus campos, sus variables y sus archivos", () => {
        const form = leer(FORMULARIO);
        // Los que solo salen en un recordatorio, y los envoltorios.
        const fuera = new Set(["contactos-y-flujo", "contacto-y-flujo", "contacto", "repeticion"]);
        const campos = [...new Set([...form.matchAll(/data-campo="([a-z-]+)"/g)].map((m) => m[1]).filter((c) => !fuera.has(c)))];
        assert.deepEqual(campos, guia.CAMPOS_DEL_FORMULARIO.map((c) => c.campo));
        assert.deepEqual(cam.VARIABLES_DE_LA_CAMPANA.map((v) => v.clave), [...guia.VARIABLES_DOCUMENTADAS]);
        const ofrecidas = /\[('\{\{[a-z]+\}\}'(?:,\s*)?)+\]/.exec(form.slice(form.indexOf('data-campo="variables"')))[0];
        assert.deepEqual([...ofrecidas.matchAll(/'([^']+)'/g)].map((m) => m[1]), [...guia.VARIABLES_DOCUMENTADAS]);
        for (const v of guia.VARIABLES_DOCUMENTADAS) assert.ok(todo.includes(v), `la guía no nombra ${v}`);
        const archivos = [...form.matchAll(/\{ type: "[a-z]+", label: "([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(archivos, [...guia.ARCHIVOS_DOCUMENTADOS]);
        assert.match(form, /Una campaña sale una sola vez/, "la ventana ya no dice que la campaña sale una vez");
    });

    test("la pausa y el aviso de riesgo: los topes y los botones son los del código", () => {
        const form = leer(FORMULARIO);
        assert.match(todo, new RegExp(`${cam.PAUSA_MINIMA}`), "la guía no dice la pausa mínima");
        assert.match(todo, new RegExp(`${cam.PAUSA_MAXIMA}`), "la guía no dice la pausa máxima");
        assert.match(form, /Riesgo de bloqueo en WhatsApp/);
        const aviso = form.slice(form.indexOf("Riesgo de bloqueo en WhatsApp"));
        assert.ok(aviso.includes("Cancelar") && aviso.includes('"Continuar"'), "el aviso no tiene sus dos botones");
        for (const b of guia.BOTONES_DEL_AVISO) assert.ok(todo.includes(b), `la guía no nombra «${b}»`);
    });

    test("el panel de segmentación: los estados y sus partes", () => {
        const seg = leer(SEGMENTO);
        const estados = [...seg.slice(0, seg.indexOf("interface")).matchAll(/label: '\S+\s([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual(estados, [...guia.ESTADOS_DEL_SEGMENTO]);
        for (const p of guia.PARTES_DEL_SEGMENTO) assert.ok(seg.includes(`data-zona="${p.zona}"`), `falta data-zona="${p.zona}"`);
        const texto = pasoDe("segmento.webp").texto;
        guia.PARTES_DEL_SEGMENTO.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.nombre}`), `el segmento no numera «${p.nombre}»`));
    });

    test("una campaña de la lista y su historial: las partes que la guía numera existen", () => {
        const lista = leer(LISTA);
        for (const p of guia.PARTES_DE_UNA_CAMPANA) assert.ok(lista.includes(`data-zona="${p.zona}"`), `falta data-zona="${p.zona}"`);
        const texto = pasoDe("tarjeta.webp").texto;
        guia.PARTES_DE_UNA_CAMPANA.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.nombre}`), `la tarjeta no numera «${p.nombre}» como ${i + 1}`));
        const botones = [...lista.matchAll(/^\s*(Reintentar fallidos|Pausar pendientes|Reanudar pausados)\s*$/gm)].map((m) => m[1]);
        assert.deepEqual(botones, [...guia.BOTONES_DEL_HISTORIAL]);
        const cifras = [...lista.matchAll(/<p className="text-xs[^"]*">(Total|Enviados|Pendientes|Fallidos)<\/p>/g)].map((m) => m[1]);
        assert.deepEqual(cifras, [...guia.CIFRAS_DEL_HISTORIAL]);
        for (const b of guia.BOTONES_DEL_HISTORIAL) assert.ok(todo.includes(b), `la guía no nombra «${b}»`);
    });

    test("la tarjeta nombra a quién le llega como la regla de lib/campanas.ts", () => {
        const c = cam.losContactosDeLaCampana("573001112233@s.whatsapp.net,573014445566@s.whatsapp.net", "Mariana Toro,Desconocido");
        assert.deepEqual(c.map((x) => x.nombre), ["Mariana Toro", "573014445566"]);
        assert.equal(cam.aQuienLeLlega(c), "2 contactos");
        assert.equal(cam.aQuienLeLlega(c.slice(0, 1)), "Mariana Toro");
        assert.equal(cam.aQuienLeLlega([]), "");
        assert.match(leer(LISTA), /losContactosDeLaCampana\(/);
    });

    test("la guía cubre todos los apartados, y cada sección tiene su página", () => {
        const slugs = guia.GUIA_CAMPANAS.secciones.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "lista", "kanban", "crear", "adjunto-y-audio", "fecha", "segmentar", "contactos-y-flujo", "pausa-y-riesgo", "historial", "editar-y-eliminar"]);
        const pagina = leer("app/guia/campanas/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.GUIA.laSeccion("no-existe"), null);
        assert.equal(guia.GUIA.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.GUIA.lasVecinas("editar-y-eliminar").siguiente, null);
        for (const s of guia.GUIA_CAMPANAS.secciones) {
            assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"campanas"/);
        assert.equal(guia.MODULO_DE_CAMPANAS, "Automatizaciones");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "campanas");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.GUIA.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/campanas/${n}`);
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
        for (const f of ["app/guia/campanas/page.tsx", "app/guia/campanas/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deCam = [["CAMPANAS", "·"], ["Campañas", "·"], ["Campanas", "·"], ["campanas", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/campanas/${rel}`), deCam), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/campanas/${rel} no es la de Leads con otro nombre`);
        }
    });

    test("su tarjeta en «Tutoriales del módulo»", () => {
        const fila = /\{\s*modulo: "campanas",\s*ruta: "([^"]+)",\s*contenido: GUIA_CAMPANAS,\s*tarjeta: "([^"]+)",?\s*\}/.exec(leer("lib/tutoriales-del-modulo.ts"));
        assert.ok(fila, "falta la fila de Campañas en GUIAS_PUBLICADAS");
        assert.equal(fila[1], "/campaigns");
        assert.match(fila[2], /^Aprende a .+ en la plataforma$/);
        assert.ok([...fila[2]].length <= 75, `la descripción mide ${[...fila[2]].length} caracteres`);
    });
}
