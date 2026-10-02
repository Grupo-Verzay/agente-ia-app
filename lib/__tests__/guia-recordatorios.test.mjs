/**
 * El banco de la GUÍA PÚBLICA de Recordatorios (`/guia/recordatorios`).
 *
 * Las mismas cosas que las demás guías, y por el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las vistas, las cifras, las
 *    columnas del tablero, los tipos de archivo, las repeticiones, los campos
 *    de la ventana, las partes de un recordatorio, el historial y el «⋯» se
 *    leen de `MainReminders.tsx`, `ReminderForm.tsx`, `ReminderList.tsx` y
 *    `lib/repeticion-del-recordatorio.ts`. Una columna o un mando nuevo sin su
 *    nombre en la guía pone esto en rojo.
 * 2. **Lo que se arregló en la pantalla al documentarla**: `@client_name` se
 *    cambia por el nombre al escribir el envío, la hora del historial se lee
 *    como el resto de la pantalla, «Todos los días» no se ofrece dos veces y el
 *    buscador de flujos busca por NOMBRE.
 * 3. **Cada imagen que la guía enseña existe**, y no sobra ninguna.
 * 4. **Es pública, no se indexa y sus dos páginas son las de Leads** con otro
 *    nombre, letra por letra.
 * 5. **Su tarjeta en «Tutoriales del módulo»**.
 *
 * `MODO=roto` lee los ficheros de `ANTES_REC_REF` —pinchado, nunca
 * `origin/main`— y afirma que no había guía, que el `@client_name` llegaba tal
 * cual al cliente, que la hora salía en crudo y que el flujo no se encontraba
 * por su nombre.
 *
 * Se levanta con `scripts/banco-guia-recordatorios.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REC_REF ?? "ab6b110";

const PANTALLA = "app/(root)/reminders/_components/MainReminders.tsx";
const FORMULARIO = "app/(root)/reminders/_components/ReminderForm.tsx";
const LISTA = "app/(root)/reminders/_components/ReminderList.tsx";
const FLUJOS = "components/custom/SelectWorkflowBox.tsx";
const ACCIONES = "actions/reminders-actions.ts";

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
    test("ANTES no había guía pública de Recordatorios", () => {
        assert.equal(leer("lib/guia-recordatorios.ts"), "", "lib/guia-recordatorios.ts ya existía");
        assert.equal(leer("app/guia/recordatorios/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_REC_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/modulo: "recordatorios"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba");
        for (const marca of ['data-zona="kanban"', "data-columna", 'data-zona="vista"']) {
            assert.ok(!leer(PANTALLA).includes(marca), `la pantalla ya tenía «${marca}»`);
        }
        assert.ok(!leer(FORMULARIO).includes("data-campo"), "la ventana ya tenía sus marcas");
    });

    test("ANTES el @client_name del seguimiento llegaba tal cual al cliente", () => {
        const acciones = leer(ACCIONES);
        assert.match(acciones, /mensaje:\s+baseMsg,/, "el seguimiento ya no se escribía con el texto en crudo");
        assert.ok(!acciones.includes("elMensajeDelRecordatorio"), "ya se cambiaba el @client_name");
    });

    test("ANTES la hora del historial salía en crudo, se ofrecía «Todos los días» y el flujo no se buscaba por nombre", () => {
        assert.match(leer(LISTA), /\{item\.time\}/, "la hora del historial ya no se pintaba en crudo");
        assert.match(leer("schema/reminder.ts"), /Todos los dias/, "«Todos los días» ya no se ofrecía");
        assert.match(leer(FLUJOS), /value=\{workflow\.id\}/, "el buscador ya buscaba por nombre");
    });

    test("la hora de un recordatorio se lee como DÍA/MES: «06/10/2026» es 6 de octubre", async () => {
        const m = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-recordatorios/pendientes-del-menu.mjs"));
        const t = new Date(m.laHoraDelRecordatorio("06/10/2026 08:30"));
        ROTO
            ? assert.notEqual(t.getMonth(), 9, "ANTES ya se leía bien")
            : assert.deepEqual([t.getDate(), t.getMonth(), t.getHours()], [6, 9, 8]);
        if (!ROTO) {
            // Una de la semana que viene no puede salir vencida.
            const ahora = new Date(2026, 9, 2, 12, 0).getTime();
            const manana = new Date(2026, 9, 3).getTime();
            const pasado = new Date(2026, 9, 4).getTime();
            assert.equal(m.elGrupoDelRecordatorio({ time: "06/10/2026 08:30", repeatType: "NONE" }, ahora, manana, pasado), "pending");
            assert.equal(m.elGrupoDelRecordatorio({ time: "03/10/2026 08:30", repeatType: "NONE" }, ahora, manana, pasado), "tomorrow");
            assert.equal(m.elGrupoDelRecordatorio({ time: "02/10/2026 18:00", repeatType: "NONE" }, ahora, manana, pasado), "today");
            assert.equal(m.elGrupoDelRecordatorio({ time: "2026-10-01T10:00:00.000Z", repeatType: "NONE" }, ahora, manana, pasado), "expired");
        }
    });

    test("en el tablero el título de una tarjeta parte en líneas, no se corta con «…»", () => {
        const lista = leer(LISTA);
        const enElTablero = lista.slice(0, lista.indexOf(") : ("));
        ROTO
            ? assert.match(enElTablero, /app-item-title flex-1 truncate/, "ANTES el título ya partía")
            : assert.ok(/app-item-title min-w-0 flex-1 break-words/.test(enElTablero) && !/app-item-title[^"]*truncate/.test(enElTablero));
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-recordatorios/guia-recordatorios.mjs"));
    const rep = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-recordatorios/repeticion-del-recordatorio.mjs"));
    const todo = guia.GUIA_RECORDATORIOS.secciones.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");

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
        for (const c of [...guia.VISTAS_DOCUMENTADAS, ...guia.CIFRAS_DOCUMENTADAS]) assert.ok(todo.includes(c), `la guía no nombra «${c}»`);
    });

    test("las columnas del tablero son las de la pantalla, en su orden", () => {
        const pantalla = leer(PANTALLA);
        const columnas = [...pantalla.matchAll(/\{ key: '[a-z]+', label: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual(columnas, [...guia.COLUMNAS_DOCUMENTADAS]);
        const kanban = guia.GUIA_RECORDATORIOS.secciones.find((s) => s.slug === "kanban").pasos.map((p) => p.texto).join(" ");
        guia.COLUMNAS_DOCUMENTADAS.forEach((c, i) => assert.ok(kanban.includes(`${i + 1} ${c}`), `el tablero no numera «${c}» como ${i + 1}`));
    });

    test("la ventana de crear: sus campos, sus archivos y sus repeticiones", () => {
        const form = leer(FORMULARIO);
        const campos = [...form.matchAll(/data-campo="([a-z-]+)"/g)].map((m) => m[1]).filter((c) => c !== "contacto-y-flujo");
        assert.deepEqual(campos, guia.CAMPOS_DEL_FORMULARIO.map((c) => c.campo));
        const archivos = [...form.matchAll(/\{ type: "[a-z]+", label: "([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(archivos, [...guia.ARCHIVOS_DOCUMENTADOS]);
        assert.deepEqual(rep.lasRepeticionesQueSeOfrecen().map((r) => r.label), [...guia.REPETICIONES_DOCUMENTADAS]);
        assert.match(form, /lasRepeticionesQueSeOfrecen\(field\.value\)/, "el desplegable no ofrece las repeticiones de lib/");
        for (const r of guia.REPETICIONES_DOCUMENTADAS.slice(1)) assert.ok(todo.includes(r), `la guía no nombra la repetición «${r}»`);
        assert.ok(!/repeatEvery/.test(form.replace(/\/\/.*$/gm, "")), "el formulario vuelve a ofrecer «Repetir cada N», que el motor no lee");
    });

    test("un recordatorio de la lista y su historial: las partes que la guía numera existen", () => {
        const lista = leer(LISTA);
        for (const p of guia.PARTES_DE_UN_RECORDATORIO) assert.ok(lista.includes(`data-zona="${p.zona}"`), `falta data-zona="${p.zona}"`);
        const texto = guia.GUIA_RECORDATORIOS.secciones[0].pasos.find((p) => p.imagen === "tarjeta.webp").texto;
        guia.PARTES_DE_UN_RECORDATORIO.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.nombre}`), `la tarjeta no numera «${p.nombre}» como ${i + 1}`));
        const botones = [...lista.matchAll(/^\s*(Reintentar fallidos|Pausar pendientes|Reanudar pausados)\s*$/gm)].map((m) => m[1]);
        assert.deepEqual(botones, [...guia.BOTONES_DEL_HISTORIAL]);
        const cifras = [...lista.matchAll(/<p className="text-xs[^"]*">(Total|Enviados|Pendientes|Fallidos)<\/p>/g)].map((m) => m[1]);
        assert.deepEqual(cifras, [...guia.CIFRAS_DEL_HISTORIAL]);
        for (const b of guia.BOTONES_DEL_HISTORIAL) assert.ok(todo.includes(b), `la guía no nombra «${b}»`);
    });

    test("@client_name se cambia por el nombre al escribir el envío, como en el motor", () => {
        assert.equal(rep.elMensajeDelRecordatorio("Hola @client_name, ¿todo bien?", "Laura Méndez"), "Hola Laura Méndez, ¿todo bien?");
        assert.equal(rep.elMensajeDelRecordatorio("Hola @client_name", null), "Hola Cliente");
        assert.equal(rep.elMensajeDelRecordatorio("Hola @client_name", "Desconocido"), "Hola Cliente");
        assert.equal(rep.elMensajeDelRecordatorio("@client_name y @client_name", "Ana"), "Ana y Ana");
        const acciones = leer(ACCIONES);
        assert.equal((acciones.match(/elMensajeDelRecordatorio\(/g) ?? []).length, 2, "crear y editar no pasan los dos por la misma regla");
    });

    test("la hora del historial se lee como el resto de la pantalla, en la zona de quien mira", () => {
        assert.equal(rep.laHoraDelEnvio("2026-10-02T14:30:00.000Z", "America/Bogota"), "02/10/2026 09:30");
        assert.equal(rep.laHoraDelEnvio("2026-10-03T04:05:00.000Z", "America/Bogota"), "02/10/2026 23:05");
        assert.equal(rep.laHoraDelEnvio("05/10/2026 08:00"), "05/10/2026 08:00", "el reloj de pared viejo se queda como está");
        assert.equal(rep.laHoraDelEnvio(""), "Sin fecha");
        assert.equal(rep.laHoraDelEnvio(null), "Sin fecha");
        assert.match(leer(LISTA), /laHoraDelEnvio\(item\.time\)/);
    });

    test("las repeticiones: «Todos los días» no se ofrece dos veces, pero se conserva si ya la tiene", () => {
        const ofrecidas = rep.lasRepeticionesQueSeOfrecen();
        assert.equal(ofrecidas.filter((r) => r.label === "Cada día").length, 1);
        assert.ok(rep.lasRepeticionesQueSeOfrecen("EVERYDAY").some((r) => r.value === "EVERYDAY"));
        assert.equal(rep.elNombreDeLaRepeticion("NONE"), "Único");
        assert.equal(rep.elNombreDeLaRepeticion("WEEKLY"), "Cada semana");
        assert.equal(rep.elNombreDeLaRepeticion("RARO"), "Recurrente");
    });

    test("el buscador de flujos encuentra el flujo por su NOMBRE", () => {
        const fuente = leer(FLUJOS);
        assert.match(fuente, /value=\{`\$\{workflow\.name\} \$\{workflow\.id\}`\}/, "cmdk busca por `value`, y tiene que llevar el nombre");
        assert.match(fuente, /setValue\(workflow\.id === value \? "" : workflow\.id\)/);
    });

    test("la guía cubre todos los apartados, y cada sección tiene su página", () => {
        const slugs = guia.GUIA_RECORDATORIOS.secciones.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "lista", "kanban", "crear", "adjunto-y-audio", "fecha-y-repeticion", "flujo", "historial", "editar-y-eliminar"]);
        const pagina = leer("app/guia/recordatorios/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.GUIA.laSeccion("no-existe"), null);
        assert.equal(guia.GUIA.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.GUIA.lasVecinas("editar-y-eliminar").siguiente, null);
        for (const s of guia.GUIA_RECORDATORIOS.secciones) {
            assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"recordatorios"/);
        assert.equal(guia.MODULO_DE_RECORDATORIOS, "Automatizaciones");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "recordatorios");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.GUIA.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/recordatorios/${n}`);
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
        for (const f of ["app/guia/recordatorios/page.tsx", "app/guia/recordatorios/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deRec = [["RECORDATORIOS", "·"], ["Recordatorios", "·"], ["recordatorios", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/recordatorios/${rel}`), deRec), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/recordatorios/${rel} no es la de Leads con otro nombre`);
        }
    });

    test("su tarjeta en «Tutoriales del módulo»", () => {
        const fila = /\{\s*modulo: "recordatorios",\s*ruta: "([^"]+)",\s*contenido: GUIA_RECORDATORIOS,\s*tarjeta: "([^"]+)",?\s*\}/.exec(leer("lib/tutoriales-del-modulo.ts"));
        assert.ok(fila, "falta la fila de Recordatorios en GUIAS_PUBLICADAS");
        assert.equal(fila[1], "/reminders");
        assert.match(fila[2], /^Aprende a .+ en la plataforma$/);
        assert.ok([...fila[2]].length <= 75, `la descripción mide ${[...fila[2]].length} caracteres`);
    });

    test("la hora de un recordatorio se lee como DÍA/MES: «06/10/2026» es 6 de octubre", async () => {
        const m = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-recordatorios/pendientes-del-menu.mjs"));
        const t = new Date(m.laHoraDelRecordatorio("06/10/2026 08:30"));
        ROTO
            ? assert.notEqual(t.getMonth(), 9, "ANTES ya se leía bien")
            : assert.deepEqual([t.getDate(), t.getMonth(), t.getHours()], [6, 9, 8]);
        if (!ROTO) {
            // Una de la semana que viene no puede salir vencida.
            const ahora = new Date(2026, 9, 2, 12, 0).getTime();
            const manana = new Date(2026, 9, 3).getTime();
            const pasado = new Date(2026, 9, 4).getTime();
            assert.equal(m.elGrupoDelRecordatorio({ time: "06/10/2026 08:30", repeatType: "NONE" }, ahora, manana, pasado), "pending");
            assert.equal(m.elGrupoDelRecordatorio({ time: "03/10/2026 08:30", repeatType: "NONE" }, ahora, manana, pasado), "tomorrow");
            assert.equal(m.elGrupoDelRecordatorio({ time: "02/10/2026 18:00", repeatType: "NONE" }, ahora, manana, pasado), "today");
            assert.equal(m.elGrupoDelRecordatorio({ time: "2026-10-01T10:00:00.000Z", repeatType: "NONE" }, ahora, manana, pasado), "expired");
        }
    });

    test("en el tablero el título de una tarjeta parte en líneas, no se corta con «…»", () => {
        const lista = leer(LISTA);
        const enElTablero = lista.slice(0, lista.indexOf(") : ("));
        ROTO
            ? assert.match(enElTablero, /app-item-title flex-1 truncate/, "ANTES el título ya partía")
            : assert.ok(/app-item-title min-w-0 flex-1 break-words/.test(enElTablero) && !/app-item-title[^"]*truncate/.test(enElTablero));
    });
}
