/**
 * El banco de la GUÍA PÚBLICA de Chats (`/guia/chats`).
 *
 * Las mismas cuatro cosas que las demás guías:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Cada nombre que la guía
 *    documenta —las pastillas, los filtros de la flecha, el «⋯» de la fila,
 *    la barra de la selección, los botones de la cabecera, el menú de
 *    Acciones, el menú de un mensaje, los botones de la barra de escribir,
 *    lo que se adjunta y los mandos de la llamada— se busca en el fichero
 *    de la pantalla que lo pinta, y en el texto de la guía. Un rótulo que
 *    cambia en la pantalla sin cambiar aquí pone esto en rojo.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa.**
 * 4. **Es simétrica con Leads**: sus dos páginas son las de Leads con otro
 *    nombre, letra por letra.
 *
 * Y la tarjeta de «Tutoriales del módulo» sale sola en `/chats`.
 *
 * `MODO=roto` lee `ANTES_CHATS_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía de Chats.
 *
 * Se levanta con `scripts/banco-guia-chats.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_CHATS_REF ?? "de0cd9d";
const C = "app/(root)/chats/_components";

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
    test("ANTES no había guía pública de Chats", () => {
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_CHATS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.equal(leer("lib/guia-chats.ts"), "", "lib/guia-chats.ts ya existía");
        assert.equal(leer("app/guia/chats/page.tsx"), "", "la página ya existía");
        assert.ok(!/"chats"/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/modulo:\s*"chats"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-chats/guia-chats.mjs"));
    const todo = guia.SECCIONES.flatMap((s) => [s.titulo, s.resumen, ...s.pasos.map((p) => `${p.titulo} ${p.texto}`), ...(s.consejos ?? [])]).join(" \n ");

    /** Cada nombre documentado tiene que estar en el código de la pantalla que lo pinta. */
    const enElCodigo = (nombres, ficheros, comoSeEscribe = (n) => n) => {
        const codigo = ficheros.map((f) => leer(f)).join("\n");
        assert.ok(codigo.length > 0, `no se leyó ${ficheros.join(", ")}`);
        for (const n of nombres) assert.ok(codigo.includes(comoSeEscribe(n)), `«${n}» no está en ${ficheros.join(", ")}`);
    };
    const enLaGuia = (nombres) => {
        for (const n of nombres) assert.ok(todo.includes(n), `ningún paso nombra «${n}»`);
    };

    test("las pastillas y los filtros de la flecha son los de la columna", () => {
        enElCodigo(guia.PASTILLAS_DOCUMENTADAS, [`${C}/ChatTabBar.tsx`]);
        enElCodigo(guia.FILTROS_DE_LA_FLECHA, [`${C}/ChatTabBar.tsx`]);
        enLaGuia([...guia.PASTILLAS_DOCUMENTADAS, ...guia.FILTROS_DE_LA_FLECHA]);
    });

    test("el «⋯» de una fila dice lo que la guía", () => {
        enElCodigo(guia.ACCIONES_DE_LA_FILA, [`${C}/ChatContactItem.tsx`, `${C}/ClasificarLeadSubmenu.tsx`]);
        enLaGuia(guia.ACCIONES_DE_LA_FILA);
    });

    test("la barra de la selección hace lo que la guía dice", () => {
        const barra = leer(`${C}/BulkActionBar.tsx`);
        for (const a of guia.ACCIONES_DE_LA_SELECCION) {
            for (const parte of a.split(" / ")) assert.ok(barra.includes(parte.replace(/^./, (x) => x)), `la barra no tiene «${parte}»`);
        }
        assert.match(barra, /Seleccionar los/);
        assert.match(todo, /Seleccionar todas|todas/);
    });

    test("los botones de la cabecera existen con ese nombre", () => {
        const fuera = new Set(["Etiquetas"]);
        enElCodigo(guia.BOTONES_DE_LA_CABECERA.filter((b) => !fuera.has(b)), [
            `${C}/ChatHeader.tsx`,
            "components/chats/MenuDeLlamada.tsx",
            `${C}/AdvisorAssignBadge.tsx`,
            `${C}/ChatReminderDialog.tsx`,
            `${C}/ChatAppointmentStatusButton.tsx`,
            `${C}/ChatRegistrosBadge.tsx`,
            `${C}/LeadContextSheet.tsx`,
            `${C}/SelectorDeEtapaDelEmbudo.tsx`,
        ]);
        assert.equal(guia.BOTONES_DE_LA_CABECERA.length, 10);
        const texto = guia.laSeccion("cabecera").pasos.find((p) => p.imagen === "cabecera-botones.webp").texto;
        for (let i = 1; i <= 10; i += 1) assert.ok(texto.includes(`${i} `), `los botones no numeran el ${i}`);
    });

    test("el menú de Acciones y el de un mensaje dicen lo que la guía", () => {
        enElCodigo(guia.ACCIONES_DEL_MENU, [`${C}/ChatHeader.tsx`]);
        enElCodigo(guia.MENU_DEL_MENSAJE, [`${C}/MessageContextMenu.tsx`, `${C}/MessageBubble.tsx`]);
        enLaGuia([...guia.ACCIONES_DEL_MENU.filter((a) => !/\.\.\./.test(a)), ...guia.MENU_DEL_MENSAJE.filter((m) => m !== "Copiar" && m !== "Eliminar")]);
        enElCodigo(guia.REACCIONES, [`${C}/MessageContextMenu.tsx`, `${C}/MessageBubble.tsx`, "lib/reacciones.ts"].filter((f) => existsSync(path.join(RAIZ, f))));
    });

    test("la barra de escribir y lo que se adjunta", () => {
        enElCodigo(guia.BOTONES_DE_LA_BARRA_DE_ESCRIBIR, [`${C}/ChatInputBar.tsx`, `${C}/ChatAutomationPicker.tsx`, `${C}/attachment-menu.tsx`, "components/shared/BarraDeEscribir.tsx", "components/shared/EmojiPickerPanel.tsx"]);
        enElCodigo(guia.LO_QUE_SE_ADJUNTA.map((a) => a.replace(" (archivo)", "")), [`${C}/attachment-menu.tsx`]);
        assert.match(leer(`${C}/TemplatePickerDialog.tsx`), /Enviar plantilla de WhatsApp/);
    });

    test("los mandos de la llamada son los de la tarjeta", () => {
        enElCodigo(guia.MANDOS_DE_LA_LLAMADA, [`${C}/CallDialog.tsx`, "components/shared/VentanaDeLlamada.tsx"]);
        enLaGuia(guia.MANDOS_DE_LA_LLAMADA.filter((m) => m !== "Plegar la llamada"));
    });

    test("cubre lo que se pidió, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "lista", "seleccion", "cabecera", "agenda", "embudo", "acciones", "mensajes", "escribir", "mas-de-la-barra", "ficha", "llamada"]);
        for (const palabra of ["presencia|en línea|escribiendo", "Llamar", "asesor", "recordatorio", "cita", "etapa", "etiqueta", "IA", "Acciones", "Responder", "Reenviar", "reacción|reaccion", "Traducir", "Editar", "Transcribir", "respuestas rápidas", "Adjuntar|clip", "nota interna", "Macros", "firma", "plantilla", "ficha"]) {
            assert.match(todo, new RegExp(palabra, "i"), `la guía no habla de «${palabra}»`);
        }
        const pagina = leer("app/guia/chats/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("llamada").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"chats"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /\bchats: \{ titulo: GUIA_CHATS\.titulo/);
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

    test("la tarjeta de «Tutoriales del módulo» sale sola en /chats", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{[^{}]*modulo:\s*"chats"[^{}]*\}/.exec(t)?.[0] ?? "";
        assert.ok(fila, "no hay fila de chats en GUIAS_PUBLICADAS");
        assert.match(fila, /ruta:\s*"\/chats"/);
        const tarjeta = /tarjeta:\s*"([^"]+)"/.exec(fila)?.[1] ?? "";
        assert.match(tarjeta, /^Aprende a [^[\]]+ en la plataforma$/);
        assert.ok([...tarjeta].length <= 75, `la descripción mide ${[...tarjeta].length} caracteres`);
        assert.ok(leer("scripts/sembrar-guia-chats.mjs").includes(`description: "${tarjeta}"`), "la semilla dice otra descripción");
        assert.match(leer("lib/navigation-routes.ts"), /"\/chats"/);
    });

    test("la semilla solo usa datos de ejemplo", () => {
        assert.doesNotMatch(leer("scripts/sembrar-guia-chats.mjs"), /@gmail|verzay|ia-app\.com/i, "la semilla lleva datos que parecen reales");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "chats");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/chats/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 3 && kb < 600, `${n} pesa ${kb.toFixed(1)} KB`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 14, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA y NO se indexa", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/chats/page.tsx", "app/guia/chats/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deChats = [["CHATS", "·"], ["Chats", "·"], ["chats", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/chats/${rel}`), deChats), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/chats/${rel} no es la de Leads con otro nombre`);
        }
    });
}
