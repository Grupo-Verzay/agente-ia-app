/**
 * El VÍDEO DE VENTAS (`/demo`) y lo que hubo que arreglar en la App para
 * grabarlo de verdad.
 *
 * El vídeo se graba contra la App real, así que lo que enseña tiene que ser lo
 * que la App hace. Al grabarlo salieron dos fallos de la conversación abierta
 * que no daban ningún error, y este banco los protege:
 *
 *   1. El BORRADOR de un aviso en vivo no se sustituía nunca: una nota de voz
 *      se quedaba en «🎧 Audio», un PDF en su etiqueta y la respuesta de la IA
 *      firmada «Asesor» (`lib/aviso-en-vivo-del-chat.ts`). Se ejerce la regla y
 *      la función de verdad de `chats-client` (`areListsDifferent`), sacada del
 *      fichero y compilada por el banco.
 *   2. La ficha, la etapa y la calificación de la conversación abierta no se
 *      ponían al día al llegar un mensaje (`lib/crm-de-la-conversacion-abierta`),
 *      y un chat nuevo no salía en la lista hasta pasada la memoria de la
 *      bandeja (`lib/bandeja.ts`).
 *
 * Y lo que es del vídeo:
 *
 *   3. La historia, el estudio y la banda sonora (puros): el arranque son
 *      cinco negocios —tienda en línea, clínica, cursos, consultoría y agencia
 *      de viajes— con un contenido distinto cada uno (el PDF y el mapa los
 *      manda la IA), la frase que los nombra cierra con «y cualquier negocio
 *      que venda por WhatsApp», la marca no lleva píldoras
 *      (lo PINTADO lo mide `montaje-del-video.test.mjs`); cada mensaje sale con
 *      la forma que el panel sabe pintar, el aviso en vivo lleva el MISMO id que
 *      la fila, las herramientas corren ANTES del aviso, ninguna pantalla pisa
 *      el rótulo ni los subtítulos, y ninguna voz pisa a otra.
 *   4. La voz: Cedar, con la caché completa y sin sobrantes; el guion dice cada
 *      frase una vez y en su orden, y cada `alDecir` cae en la frase que suena.
 *   5. La página: pública, no indexable, y promete exactamente lo que el vídeo
 *      enseña (las mismas capacidades y el mismo llamado que la historia).
 *   6. El vídeo publicado: MP4 H.264 + AAC 1920×1080 a 25 fps, menos de dos
 *      minutos, narrado con Cedar y con el guion de hoy, sin huecos mudos.
 *
 * `MODO=roto` mira ANTES_REF —pinchado a un commit, nunca `origin/main`— y
 * afirma el fallo: la `areListsDifferent` de entonces no sustituía el borrador,
 * y no había ni vídeo, ni página, ni refresco de la ficha.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const MODO = process.env.MODO ?? "bueno";
const ANTES = process.env.ANTES_REF ?? "316b70c";
const COMPILADO = path.join(RAIZ, "lib", "__tests__", ".compilado", "video-de-ventas");
const CHATS_CLIENT = "app/(root)/chats/_components/chats-client.tsx";
const leer = (ruta) => readFileSync(path.join(RAIZ, ruta), "utf8");
const existiaEn = (ruta, ref = ANTES) => spawnSync("git", ["cat-file", "-e", `${ref}:${ruta}`], { cwd: RAIZ }).status === 0;
const deAntes = (ruta) => execFileSync("git", ["show", `${ANTES}:${ruta}`], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 << 20 });
const importar = (ruta) => import(pathToFileURL(ruta).href);

/** Un mensaje de la conversación como lo tiene la pantalla. */
const mensaje = (id, ts, extra = {}) => ({ key: { id, remoteJid: "57300@s.whatsapp.net", fromMe: false }, messageTimestamp: ts, message: {}, ...extra });

/**
 * Las escenas que se añadieron después (la apertura nueva, Google Sheets, la
 * llamada con IA, el asesor, los reportes, el resumen, la ráfaga y el WhatsApp
 * del cierre). Su «antes» es SU commit —ANTES_DE_LAS_ESCENAS—, no el del resto.
 */
const ANTES_DE_LAS_ESCENAS = process.env.ANTES_DE_LAS_ESCENAS ?? "e2e0005";
const deAntesDeLasEscenas = (ruta) => execFileSync("git", ["show", `${ANTES_DE_LAS_ESCENAS}:${ruta}`], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 << 20 });
const GANCHO_PEDIDO =
    "Cada minuto sin respuesta es una venta que se enfría. Tiendas en línea, clínicas, cursos, consultorías, agencias de viajes… y cualquier negocio que venda por WhatsApp, responde al instante.";
const SEGUIMIENTO_PEDIDO = "Si Laura deja de responder, la IA insiste como tú decidas: con texto, nota de voz, un archivo o hasta una llamada.";

if (MODO === "roto") {
    describe(`MODO=roto: en ${ANTES_DE_LAS_ESCENAS} no estaban las escenas nuevas`, () => {
        test("la apertura decía otra cosa, y no había Sheets, llamada, asesor, reportes ni resumen", () => {
            const narr = deAntesDeLasEscenas("scripts/video-de-ventas/narracion.mjs");
            const hist = deAntesDeLasEscenas("scripts/video-de-ventas/historia.mjs");
            const est = deAntesDeLasEscenas("scripts/video-de-ventas/estudio.mjs");
            assert.ok(!narr.includes("se enfría"), "la apertura ya era la de hoy");
            assert.match(est, /Tus clientes escriben\. <span>La IA responde\.<\/span>/);
            for (const falta of ["sheets:", "asesor:", "reportes:", "resumen:", "avanzadas:"]) assert.ok(!narr.includes(`    ${falta}`), `ya había ${falta}`);
            assert.match(narr, /La IA le hace seguimiento sola/);
            assert.ok(!hist.includes('tipo: "llamada"'), "ya había llamada");
            assert.match(hist, /whatsapp: "573115616975"/, "el cierre ya llevaba el número nuevo");
            assert.ok(!est.includes("Escribir por WhatsApp"), "el cierre ya tenía el botón de WhatsApp");
        });

        test("las capas escondidas del portátil solo eran transparentes: con una cuarta, no se pintaba ninguna", () => {
            const est = deAntesDeLasEscenas("scripts/video-de-ventas/estudio.mjs");
            // El fuente lleva `${…}` dentro de la regla: se lee la línea entera.
            const inactiva = est.match(/^#portatil iframe \{.*$/m)?.[0] ?? "";
            assert.match(inactiva, /opacity:\s*0/);
            assert.doesNotMatch(inactiva, /visibility/, "la capa escondida ya dejaba de rasterizarse");
        });
    });
}

/**
 * La portada, la escena del equipo, la entrada rápida de la marca y el cierre
 * sin botones. Su «antes» es SU commit —ANTES_DEL_EQUIPO—.
 */
const ANTES_DEL_EQUIPO = process.env.ANTES_DEL_EQUIPO ?? "6619c2e";
const deAntesDelEquipo = (ruta) => execFileSync("git", ["show", `${ANTES_DEL_EQUIPO}:${ruta}`], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 << 20 });

if (MODO === "roto") {
    describe(`MODO=roto: en ${ANTES_DEL_EQUIPO} no había portada ni escena del equipo, y el cierre llevaba botones`, () => {
        test("sin portada, con la ráfaga de «Y hay más» y con los botones en el cierre", () => {
            const narr = deAntesDelEquipo("scripts/video-de-ventas/narracion.mjs");
            const hist = deAntesDelEquipo("scripts/video-de-ventas/historia.mjs");
            const est = deAntesDelEquipo("scripts/video-de-ventas/estudio.mjs");
            const guion = deAntesDelEquipo("scripts/grabar-video-de-ventas.mjs");
            assert.ok(!est.includes('id="portada"'), "ya había portada");
            assert.match(guion, /est\("plano", PLANOS\.montaje\)/);
            assert.ok(!guion.includes("PLANOS.portada"));
            assert.match(narr, /    avanzadas:/, "no había ráfaga");
            assert.ok(!narr.includes("multiagente:"), "ya había escena del equipo");
            assert.match(hist, /Modo dueño/);
            assert.match(est, /Agenda una reunión/);
            assert.match(est, /Escribir por WhatsApp/);
        });
    });
}

if (MODO === "roto") {
    describe(`MODO=roto: en ${ANTES} el borrador de un aviso en vivo se quedaba para siempre`, () => {
        test("la regla del borrador no existía", () => {
            assert.equal(existiaEn("lib/aviso-en-vivo-del-chat.ts"), false);
            assert.equal(deAntes(CHATS_CLIENT).includes("traeLoQueFaltabaDeUnAviso"), false);
        });

        test("la areListsDifferent de entonces no ve el mensaje real detrás del borrador", async () => {
            const { areListsDifferent } = await importar(path.join(COMPILADO, "lista-antes.mjs"));
            const borrador = [mensaje("A", 100), mensaje("NOTA", 200, { delAvisoEnVivo: true, message: { conversation: "[Audio]" } })];
            const real = [mensaje("A", 100), mensaje("NOTA", 200, { message: { audioMessage: { seconds: 7 } } })];
            assert.equal(areListsDifferent(borrador, real), false, "la nota real llegaba y la pantalla se quedaba con «🎧 Audio»");
        });

        test("no había refresco de la ficha ni segunda vuelta de un chat nuevo", () => {
            assert.equal(existiaEn("lib/crm-de-la-conversacion-abierta.ts"), false);
            assert.equal(deAntes("lib/bandeja.ts").includes("SEGUNDA_VUELTA_DE_UN_CHAT_NUEVO_MS"), false);
        });

        test("no había vídeo de ventas, ni página, ni banco", () => {
            for (const ruta of ["app/demo/page.tsx", "lib/video-de-ventas.ts", "scripts/grabar-video-de-ventas.mjs", "scripts/video-de-ventas/historia.mjs", "public/demo/verzay-demo.mp4"]) {
                assert.equal(existiaEn(ruta), false, `${ruta} ya existía en ${ANTES}`);
            }
            assert.equal(/\/demo/.test(deAntes("middleware.ts")), false, "el middleware ya abría /demo");
        });
    });
} else {
    const aviso = await importar(path.join(COMPILADO, "aviso-en-vivo-del-chat.mjs"));
    const crm = await importar(path.join(COMPILADO, "crm-de-la-conversacion-abierta.mjs"));
    const bandeja = await importar(path.join(COMPILADO, "bandeja.mjs"));
    const pagina = await importar(path.join(COMPILADO, "video-de-ventas.mjs"));
    const { areListsDifferent } = await importar(path.join(COMPILADO, "lista-ahora.mjs"));

    const historia = await import("../../scripts/video-de-ventas/historia.mjs");
    const backend = await import("../../scripts/video-de-ventas/backend.mjs");
    const estudio = await import("../../scripts/video-de-ventas/estudio.mjs");
    const banda = await import("../../scripts/video-de-ventas/banda-sonora.mjs");
    const narracion = await import("../../scripts/video-de-ventas/narracion.mjs");
    const cedar = await import("../../scripts/voz-cedar.mjs");
    const { RITMO } = await import("../../scripts/voz-de-la-guia.mjs");

    describe("1. el borrador de un aviso en vivo se sustituye por el mensaje real", () => {
        const llave = (m) => m.key?.id;

        test("la regla: un borrador cuya versión real ya llegó cuenta como cambio", () => {
            const enPantalla = [mensaje("A", 1), mensaje("B", 2, { [aviso.DEL_AVISO_EN_VIVO]: true })];
            assert.equal(aviso.traeLoQueFaltabaDeUnAviso(enPantalla, [mensaje("A", 1), mensaje("B", 2)], llave), true);
        });

        test("sin borradores, o con la versión que también es borrador, no hay nada nuevo", () => {
            assert.equal(aviso.traeLoQueFaltabaDeUnAviso([mensaje("A", 1)], [mensaje("A", 1)], llave), false);
            const borrador = mensaje("B", 2, { [aviso.DEL_AVISO_EN_VIVO]: true });
            assert.equal(aviso.traeLoQueFaltabaDeUnAviso([borrador], [borrador], llave), false, "sustituir un borrador por otro repintaría en cada vuelta");
            assert.equal(aviso.traeLoQueFaltabaDeUnAviso([borrador], [mensaje("C", 2)], llave), false);
        });

        test("la función de verdad de chats-client: el reloj sustituye la nota, el PDF y la respuesta de la IA", () => {
            for (const [que, real] of [
                ["la nota de voz", { message: { audioMessage: { seconds: 7 } } }],
                ["el PDF", { message: { documentMessage: { fileName: "lista.pdf" } } }],
                ["la respuesta de la IA", { key: { id: "true_57300@s.whatsapp.net_NOTA", fromMe: true }, sentByAi: true, message: { conversation: "¡Hola!" } }],
            ]) {
                const borrador = [mensaje("A", 100), mensaje("NOTA", 200, { delAvisoEnVivo: true, message: { conversation: "[Audio]" } })];
                const delReloj = [mensaje("A", 100), { ...mensaje("NOTA", 200), ...real, key: { ...mensaje("NOTA", 200).key, ...(real.key ?? {}) } }];
                assert.equal(areListsDifferent(borrador, delReloj), true, `${que} se quedaba en borrador`);
            }
        });

        test("una vez mezclado, el reloj vuelve a no hacer nada cuando no hay nada", () => {
            const real = [mensaje("A", 100), mensaje("NOTA", 200, { message: { audioMessage: { seconds: 7 } } })];
            assert.equal(areListsDifferent(real, real.map((m) => ({ ...m }))), false);
        });

        test("el borrador lleva la marca, y la marca es la de la regla", () => {
            const src = leer(CHATS_CLIENT);
            assert.match(src, /import \{ DEL_AVISO_EN_VIVO, traeLoQueFaltabaDeUnAviso \} from "@\/lib\/aviso-en-vivo-del-chat"/);
            assert.match(src, /\[DEL_AVISO_EN_VIVO\]: true/, "el mensaje que pinta el aviso en vivo no lleva la marca");
            assert.equal(aviso.DEL_AVISO_EN_VIVO, "delAvisoEnVivo");
        });
    });

    describe("2. el CRM de la conversación abierta se pone al día", () => {
        test("un mensaje nuevo es otro id, no más viejo, y no la primera carga", () => {
            assert.equal(crm.esUnMensajeNuevo({ id: "A", ts: 1 }, { id: "B", ts: 2 }), true);
            assert.equal(crm.esUnMensajeNuevo({ id: undefined, ts: 0 }, { id: "B", ts: 2 }), false, "abrir el chat no es una novedad");
            assert.equal(crm.esUnMensajeNuevo({ id: "B", ts: 2 }, { id: "A", ts: 1 }), false, "cargar mensajes anteriores no es una novedad");
            assert.equal(crm.esUnMensajeNuevo({ id: "A", ts: 1 }, { id: "A", ts: 1 }), false);
        });

        test("la ficha fresca no pisa lo que se está escribiendo", () => {
            const ficha = crm.mezclarLaFicha({ servicio: "Ortodoncia", nota: "" }, { servicio: "", nota: "" }, { servicio: "Blanqueamiento dental", nota: "", origen: "Instagram" });
            assert.deepEqual(ficha, { servicio: "Ortodoncia", nota: "", origen: "Instagram" });
        });

        test("la sesión releída llega a TODAS las llaves de la fila, sin borrar un nombre con un vacío", () => {
            const mapa = { "57300": { id: 7, leadStatus: null, customName: "Laura" }, "SONRIE::57300": { id: 7, leadStatus: null, customName: "Laura" }, otra: { id: 8, leadStatus: null } };
            const { siguiente, tocadas } = crm.conLaSesionAlDia(mapa, 7, { leadStatus: "CALIENTE", customName: null });
            assert.equal(tocadas, 2);
            assert.equal(siguiente["SONRIE::57300"].leadStatus, "CALIENTE");
            assert.equal(siguiente["SONRIE::57300"].customName, "Laura");
            assert.equal(siguiente.otra, mapa.otra);
            assert.equal(crm.conLaSesionAlDia(siguiente, 7, { leadStatus: "CALIENTE" }).siguiente, siguiente, "sin cambios no se repinta");
        });

        test("un chat sin ficha se pide como mucho una vez por espera", () => {
            assert.equal(crm.hayQuePedirSuFicha(true, undefined, 0), false);
            assert.equal(crm.hayQuePedirSuFicha(false, undefined, 0), true);
            assert.equal(crm.hayQuePedirSuFicha(false, 1000, 1000 + crm.ESPERA_PARA_PEDIR_SU_FICHA_MS - 1), false);
            assert.equal(crm.hayQuePedirSuFicha(false, 1000, 1000 + crm.ESPERA_PARA_PEDIR_SU_FICHA_MS), true);
        });

        test("la segunda vuelta de un chat nuevo cae DESPUÉS de la memoria de la bandeja, y el servidor usa esa memoria", () => {
            assert.ok(bandeja.SEGUNDA_VUELTA_DE_UN_CHAT_NUEVO_MS > bandeja.MEMORIA_DE_LA_BANDEJA_MS);
            assert.match(leer("lib/chat-persistence.ts"), /const INBOX_CACHE_TTL_MS = MEMORIA_DE_LA_BANDEJA_MS;/);
            assert.match(leer(CHATS_CLIENT), /SEGUNDA_VUELTA_DE_UN_CHAT_NUEVO_MS\)/);
        });
    });

    describe("3. la historia, el estudio y la banda sonora", () => {
        const cal = historia.elCalendario(Date.UTC(2026, 8, 28, 15, 0));
        const conversacion = historia.laConversacion(cal);

        test("dieciséis mensajes, M01 a M16, en orden y con hora", () => {
            assert.deepEqual(conversacion.map((m) => m.id), Array.from({ length: 16 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`));
            for (let i = 1; i < conversacion.length; i += 1) assert.ok(conversacion[i].en >= conversacion[i - 1].en, `${conversacion[i].id} va antes que ${conversacion[i - 1].id}`);
        });

        test("cada mensaje sale con la forma que el panel pinta, y su aviso en vivo con el MISMO id", () => {
            const tipos = { texto: "conversation", nota: "audioMessage", documento: "documentMessage", video: "videoMessage", imagen: "imageMessage", llamada: "call" };
            for (const m of conversacion) {
                const fila = backend.comoLoGuardaElWebhook(m, { base: "http://x", segundos: { notaDeLaClienta: 6, notaDeLaIa: 8 } });
                assert.equal(fila.messageType, tipos[m.tipo], m.id);
                assert.equal(fila.raw.key.fromMe, m.de === "ia", m.id);
                if (m.de === "ia") assert.equal(fila.raw.sentByAi, true, `${m.id}: sin la marca sale firmado «Asesor»`);
                if (m.tipo === "nota") assert.ok(fila.raw.transcripcion, `${m.id}: la nota sale sin transcripción`);
                const enVivo = backend.elAvisoEnVivo(m, fila);
                assert.equal(enVivo.message.id, fila.raw.key.id, `${m.id}: si el id no casa, el borrador no se sustituye nunca`);
                assert.equal(enVivo.message.messageType, fila.messageType);
            }
            assert.throws(() => backend.laPresencia("bailando", 0));
        });

        test("las herramientas de la IA corren ANTES del aviso en vivo, como en el motor", () => {
            const src = leer("scripts/video-de-ventas/backend.mjs");
            const cuerpo = src.slice(src.indexOf("async function llega("));
            assert.ok(cuerpo.indexOf("efectos") >= 0 && cuerpo.indexOf("efectos") < cuerpo.indexOf('avisar("chat:changed"'), "el aviso sale antes de que la ficha cambie");
        });

        test("el celular y WhatsApp Web pintan cada mensaje con lo que su burbuja necesita", () => {
            for (const m of conversacion) {
                const b = estudio.elMensajeDelEstudio(m, { segundos: { notaDeLaClienta: 6, notaDeLaIa: 8, videoDeLaClinica: 9 } });
                assert.equal(b.hora, historia.laHora(m.en));
                if (m.medio) assert.match(b.url, /^\/__estudio\/medios\//, m.id);
                if (m.tipo === "nota") assert.match(b.duracion, /^0:0\d$/);
            }
            assert.match(historia.MEDIOS.videoDeLaClinica.archivo, /\.webm$/, "el Chromium que graba no trae H.264: un MP4 dentro del estudio sale en blanco");
        });

        test("el arranque: cinco negocios en su orden, cada uno con un contenido distinto", () => {
            const negocios = historia.NEGOCIOS_DEL_ARRANQUE;
            assert.deepEqual(negocios.map((n) => n.tipo), ["Tienda en línea", "Clínica", "Cursos", "Consultoría", "Agencia de viajes"]);
            assert.deepEqual(new Set(negocios.map((n) => n.medio)), new Set(["imagen", "nota", "video", "documento", "ubicacion"]));
            // Quién manda el archivo: el PDF de la consultoría y el mapa del
            // viaje los manda la IA; la nota de voz, la clienta.
            const quien = Object.fromEntries(negocios.map((n) => [n.medio, n.mensajes.find((m) => m.tipo === n.medio).de]));
            assert.equal(quien.documento, "ia", "el PDF de la consultoría lo manda el cliente");
            assert.equal(quien.ubicacion, "ia", "la ubicación del viaje no la manda la IA");
            assert.equal(quien.nota, "cliente");
            for (const n of negocios) {
                // El contenido que dice la tarjeta es el que llevan sus mensajes, y solo uno.
                const contenidos = n.mensajes.map((m) => m.tipo).filter((t) => t !== "texto");
                assert.deepEqual(contenidos, [n.medio], `«${n.tipo}» dice ${n.medio} y lleva ${contenidos}`);
            }
            const tarjetas = estudio.losNegociosDelMontaje(negocios, { hora: "9:40 a. m." });
            const porTipo = Object.fromEntries(tarjetas.flatMap((t) => t.mensajes).filter((m) => m.tipo !== "texto").map((m) => [m.tipo, m]));
            assert.match(porTipo.imagen.url, /^\/__estudio\/medios\/montaje-/);
            assert.match(porTipo.video.portada, /^\/__estudio\/medios\/montaje-/);
            assert.equal(porTipo.video.duracion, "0:42");
            assert.equal(porTipo.nota.duracion, "0:07");
            assert.equal(porTipo.nota.avatar.color, negocios.find((n) => n.medio === "nota").color, "la nota sale con la foto de la clienta de la historia, no con la del contacto de su tarjeta");
            assert.equal(porTipo.documento.nombre, "Requisitos-renta.pdf");
            assert.ok(porTipo.documento.texto, "el PDF de la IA va sin el texto que lo acompaña");
            assert.match(porTipo.ubicacion.url, /^\/__estudio\/medios\/montaje-mapa-/);
            assert.ok(porTipo.ubicacion.nombre && porTipo.ubicacion.direccion, "la ubicación va sin su nombre o su dirección");
            assert.equal(new Set(tarjetas.flatMap((t) => t.mensajes.map((m) => m.id))).size, tarjetas.flatMap((t) => t.mensajes).length, "dos burbujas del arranque con el mismo id");
            assert.throws(() => estudio.losNegociosDelMontaje([{ ...negocios[0], mensajes: [{ de: "ia", tipo: "imagen", archivo: "no-existe" }] }], { hora: "" }));
        });

        test("la frase del arranque nombra los cinco en su orden y cierra con «cualquier negocio»", () => {
            const gancho = narracion.NARRACION.gancho.texto;
            let desde = 0;
            for (const nombre of ["Tiendas en línea", "clínicas", "cursos", "consultorías", "agencias de viajes"]) {
                const i = gancho.indexOf(nombre, desde);
                assert.ok(i >= desde, `«${nombre}» no está, o no va en su orden, en «${gancho}»`);
                desde = i + nombre.length;
            }
            assert.ok(gancho.indexOf(historia.CIERRE_DEL_MONTAJE) > desde, "el cierre no va después de los cinco negocios");
            assert.match(leer("scripts/grabar-video-de-ventas.mjs"), /await alDecir\("y cualquier negocio"\);\s*\n\s*const cierreDelMontajeMs = .*yCualquierNegocio/, "el cierre no sale con la frase que lo dice");
        });

        test("la marca: solo la frase, sin la lista de píldoras debajo", () => {
            assert.equal("CHIPS_DE_LA_MARCA" in historia, false);
            assert.equal(Object.values(historia.LEMA_DE_LA_MARCA).join(""), "Inteligencia artificial que atiende, vende y agenda por WhatsApp");
            assert.doesNotMatch(leer("scripts/video-de-ventas/estudio.mjs"), /chipsMarca/);
            assert.doesNotMatch(leer("scripts/grabar-video-de-ventas.mjs"), /chipsDeLaMarca/);
        });

        test("ninguna pantalla pisa el rótulo de arriba ni los subtítulos, ni se sale del cuadro", () => {
            for (const [nombre, plano] of Object.entries(estudio.PLANOS)) {
                for (const pantalla of ["tel", "web", "portatil", "sheets"]) {
                    if (!plano[pantalla]) continue;
                    const c = estudio.laCajaDe(pantalla, plano[pantalla]);
                    assert.ok(c.y >= estudio.LIMITE_DE_ARRIBA - 0.5, `${nombre}/${pantalla} sube hasta ${c.y}`);
                    assert.ok(c.y + c.h <= estudio.LIMITE_DE_ABAJO + 0.5, `${nombre}/${pantalla} baja hasta ${Math.round(c.y + c.h)}`);
                    assert.ok(c.x >= 0 && c.x + c.w <= estudio.VISTA.ancho, `${nombre}/${pantalla} se sale por un lado`);
                }
            }
        });

        test("ninguna nota de voz pisa la narración, y la mezcla coloca cada tramo en su sitio", () => {
            const audio = (ms) => ({ frecuencia: 24000, canales: 1, bits: 16, datos: Buffer.alloc(Math.round((ms / 1000) * 24000) * 2), ms });
            const tramos = [
                { clase: "narracion", texto: "a", audio: audio(1000), inicioMs: 0 },
                { clase: "nota", texto: "n", audio: audio(500), inicioMs: 1100 },
                { clase: "aviso", audio: audio(200), inicioMs: 500 },
            ];
            assert.deepEqual(banda.sePisanLasVoces(tramos), []);
            const choques = banda.sePisanLasVoces([...tramos, { clase: "nota", texto: "m", audio: audio(500), inicioMs: 500 }]);
            assert.deepEqual(choques.map((c) => [c.a, c.b, c.ms]), [["a", "m", 500]]);
            const { colocados } = banda.mezclarLaBanda(tramos, 2000);
            assert.deepEqual(colocados.map((c) => c.inicioMs), [0, 1100, 500]);
        });
    });

    describe("4. la voz y el guion", () => {
        const guion = leer("scripts/grabar-video-de-ventas.mjs");
        const textos = narracion.loQueSeSintetiza();

        test("todo está sintetizado con Cedar, y en la caché no sobra nada", () => {
            assert.equal(narracion.VOZ_DE_VENTAS.voz, "cedar");
            const faltan = textos.filter((t) => !existsSync(cedar.rutaDeLaFrase(t.texto, narracion.CACHE_DE_VENTAS, t.voz)));
            assert.deepEqual(faltan.map((t) => t.texto), [], "falta sintetizar (desde el contenedor de la App)");
            const esperadas = new Set(textos.map((t) => path.basename(cedar.rutaDeLaFrase(t.texto, narracion.CACHE_DE_VENTAS, t.voz))));
            const sobran = readdirSync(narracion.CACHE_DE_VENTAS).filter((f) => f.endsWith(".ogg") && !esperadas.has(f));
            assert.deepEqual(sobran, [], "una frase que ya no se dice sigue en la caché");
        });

        test("el guion dice cada frase UNA vez y en el orden de la narración", () => {
            const dichas = [...guion.matchAll(/await decir\("(\w+)"\)/g)].map((m) => m[1]);
            assert.deepEqual(dichas, Object.keys(narracion.NARRACION));
        });

        test("cada alDecir cae en la frase que suena", () => {
            let actual = null;
            for (const linea of guion.split("\n")) {
                const d = /await decir\("(\w+)"\)/.exec(linea);
                if (d) actual = narracion.NARRACION[d[1]].texto;
                const a = /await alDecir\("([^"]+)"/.exec(linea);
                if (a) assert.ok(actual?.includes(a[1]), `«${a[1]}» no está en «${actual}»`);
            }
        });

        test("cada mensaje llega una vez, y cada escena se rotula con su capacidad", () => {
            const llegan = [...guion.matchAll(/await llega\("(M\d\d)"/g)].map((m) => m[1]);
            assert.deepEqual(llegan, historia.laConversacion(historia.elCalendario(0)).map((m) => m.id));
            const rotuladas = [...guion.matchAll(/await capacidad\("(\w+)"\)/g)].map((m) => m[1]);
            assert.deepEqual(rotuladas, historia.CAPACIDADES.map((c) => c.escena));
        });

        test("el mismo ritmo que las guías: respiro corto y pausas recortadas", () => {
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.ok(respiro > 0 && respiro <= 300, `respiro de ${respiro} ms`);
            assert.ok(RITMO.pausaMaximaMs <= 300);
            assert.doesNotMatch(guion, /recordVideo/, "recordVideo estira el vídeo y lo despega de la voz");
        });

        test("lo que se sirve al estudio sale de MEDIOS, y lo que el estudio no puede pintar no es mudo", () => {
            // Con la lista escrita a mano se servía un .mp4 viejo cuando el vídeo
            // pasó a .webm: 404 y el vídeo de WhatsApp Web se quedaba en su portada.
            assert.match(guion, /Object\.values\(MEDIOS\)/, "los archivos servidos no salen de MEDIOS");
            assert.doesNotMatch(guion, /"conoce-la-clinica\.(mp4|webm)"/, "el nombre del vídeo está escrito a mano en el guion");
            assert.match(guion, /fallosDelEstudio\.length && !ENSAYO\) throw/, "un vídeo que no carga no tumba la grabación de verdad");
            assert.match(leer("scripts/video-de-ventas/estudio.mjs"), /el vídeo no carga/, "el estudio calla que un vídeo no carga");
            assert.match(leer("scripts/video-de-ventas/estudio-servido.mjs"), /"\.webm": "video\/webm"/);
        });
    });

    describe("4b. las escenas nuevas", () => {
        const cal = historia.elCalendario(Date.UTC(2026, 8, 28, 15, 0));
        const guion = leer("scripts/grabar-video-de-ventas.mjs");
        const html = estudio.laPaginaDelEstudio({ montaje: [], logo: "x", web: historia.LLAMADO.web, clienta: { nombre: "Laura Gómez", iniciales: "L", color: "#000" } });

        test("la apertura: el título y la voz que se pidieron, y el resto igual", () => {
            assert.equal(narracion.NARRACION.gancho.texto, GANCHO_PEDIDO);
            assert.match(html, /<div class="titulo">Cada minuto sin respuesta es <span>una venta que se enfría<\/span><\/div>/);
            assert.match(guion, /await alDecir\("responde al instante"\)/);
        });

        test("en la historia de Laura: Sheets, la llamada, el asesor y los reportes, cada uno con su frase", () => {
            const n = narracion.NARRACION;
            const orden = Object.keys(n);
            assert.equal(n.sheets.texto, "Y los datos de Laura también quedan guardados en tu Google Sheets.");
            assert.equal(orden.indexOf("sheets"), orden.indexOf("voz") + 1, "Sheets no va justo después de la financiación (la nota de voz)");
            assert.equal(n.seguimiento.texto, SEGUIMIENTO_PEDIDO);
            assert.equal(n.asesor.texto, "Si la IA no sabe responder o Laura pide hablar con alguien, la conversación pasa directo a un asesor.");
            assert.equal(n.reportes.texto, "Todo el historial queda resumido en reportes y analíticas, sin perseguir a nadie.");
            assert.deepEqual(orden.slice(orden.indexOf("reportes")), ["reportes", "multiagente", "resumen", "cierre"], "después de los reportes van el equipo, el resumen y el cierre, y nada más");
            assert.ok(!("avanzadas" in n), "sigue la ráfaga de «Y hay más»");
        });

        test("la llamada: se oye a las dos, por teléfono, y queda en la conversación como la anota la plataforma", () => {
            assert.deepEqual([...new Set(historia.LA_LLAMADA.map((l) => l.quien))].sort(), ["clienta", "ia"]);
            const textos = narracion.loQueSeSintetiza().map((t) => t.texto);
            for (const l of historia.LA_LLAMADA) assert.ok(textos.includes(l.texto), "una línea de la llamada no se sintetiza");
            const m = historia.laConversacion(cal).find((x) => x.tipo === "llamada");
            const fila = backend.comoLoGuardaElWebhook(m, { base: "http://x", segundos: { llamada: 17 } });
            assert.equal(fila.messageType, "call");
            assert.equal(fila.content, "Llamada con IA realizada");
            assert.deepEqual(fila.raw.message.call, { direction: "outgoing", isVideo: false, durationSecs: 17, isBot: true, provider: "astra" });
            assert.equal(estudio.elMensajeDelEstudio(m, { segundos: { llamada: 17 } }).duracion, "0:17");
            assert.match(guion, /sonar\("tono", TONO/);
            assert.match(guion, /sonar\("llamada", l\.audio/);
            // El tono no es una voz: no choca con nada. Una línea de la llamada sí.
            const audio = (ms) => ({ frecuencia: 24000, canales: 1, bits: 16, datos: Buffer.alloc(Math.round((ms / 1000) * 24000) * 2), ms });
            assert.deepEqual(banda.sePisanLasVoces([{ clase: "narracion", texto: "a", audio: audio(1000), inicioMs: 0 }, { clase: "tono", audio: audio(800), inicioMs: 200 }]), []);
            assert.equal(banda.sePisanLasVoces([{ clase: "narracion", texto: "a", audio: audio(1000), inicioMs: 0 }, { clase: "llamada", texto: "b", audio: audio(800), inicioMs: 200 }]).length, 1);
            const tel = banda.porTelefono(banda.elTonoDeLlamada());
            assert.equal(tel.datos.length, banda.elTonoDeLlamada().datos.length);
        });

        test("el asesor: la conversación pasa a la asesora y queda en espera", () => {
            const m16 = historia.laConversacion(cal).find((x) => x.id === "M16");
            assert.deepEqual(m16.efectos, [{ asesor: true }, { escalado: true }]);
            assert.match(leer("scripts/video-de-ventas/backend.mjs"), /assignedAdvisorId: ctx\.asesor/);
            assert.match(leer("scripts/video-de-ventas/backend.mjs"), /UPDATE "Session" SET escalated_at/);
        });

        test("el resumen enseña TODAS las capacidades, Sheets y las llamadas incluidas", () => {
            const titulos = historia.CAPACIDADES.map((c) => c.titulo);
            for (const t of ["Sincroniza con Google Sheets", "Hace llamadas con IA", "Trabaja en equipo"]) assert.ok(titulos.includes(t));
            const pildoras = [...html.matchAll(/<div class="pildora"><span class="num">\d+<\/span><b>([^<]+)<\/b><\/div>/g)].map((x) => x[1]);
            assert.deepEqual(pildoras, titulos);
        });

        test("el cierre es solo la marca y su frase: sin botones (el llamado llega después por texto)", () => {
            const cierre = html.match(/<div id="cierre"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
            assert.ok(cierre.includes("Verzay"), "el cierre no lleva la marca");
            assert.doesNotMatch(html, /class="cta/, "el cierre sigue con botones");
            assert.doesNotMatch(html, /Agenda una reunión|Escribir por WhatsApp/);
            assert.equal(narracion.NARRACION.cierre.texto, "Verzay responde, vende, agenda y hace seguimiento, las veinticuatro horas.");
            // La página sí conserva sus dos llamados, con el número de siempre.
            assert.equal(pagina.LLAMADO_DEL_VIDEO.whatsapp, "573233612620");
        });

        test("la portada: logo, nombre y un botón de reproducir, y es lo primero que se graba", () => {
            const portada = html.match(/<div id="portada" class="tarjeta">[\s\S]*?aria-label="Reproducir"/)?.[0];
            assert.ok(portada, "no hay portada con su botón de reproducir");
            assert.match(portada, /Verzay/);
            assert.ok(estudio.PLANOS.portada?.portada, "no hay plano de portada");
            const antesDeGrabar = guion.slice(0, guion.indexOf("await grabar(p, mudo"));
            const planos = [...antesDeGrabar.matchAll(/^await est\("plano", PLANOS\.(\w+)\)/gm)].map((m) => m[1]);
            assert.equal(planos.at(-1), "portada", "lo que hay delante cuando empieza la grabación no es la portada");
            assert.match(guion, /const PORTADA_MS = \d+;/);
            assert.ok(Number(guion.match(/const PORTADA_MS = (\d+);/)[1]) <= 800, "la portada se queda tanto que la voz empieza tarde");
        });

        test("del arranque a la marca no hay pausa muerta: la marca entra deslizándose en cuanto calla el gancho", () => {
            const entre = guion.slice(guion.indexOf('await alDecir("responde al instante")'), guion.indexOf('await est("plano", PLANOS.marca)'));
            assert.match(entre, /await callar\(0\)/, "se espera a que pase el respiro antes de la marca");
            assert.doesNotMatch(entre, /await espera\(p, \d{4,}\)/, "hay una espera larga entre el arranque y la marca");
            const regla = html.match(/^#marca \{.*$/m)?.[0] ?? "";
            assert.match(regla, /translateX/, "la marca no entra con movimiento");
            const dura = Math.max(...[...regla.matchAll(/(\.\d+|\d+(?:\.\d+)?)s/g)].map((m) => Number(m[1])));
            assert.ok(dura <= 0.6, `la entrada de la marca dura ${dura} s`);
        });

        test("Trabaja en equipo: las tres líneas con sus asesores, y el embudo de UNA asesora", () => {
            assert.equal(narracion.NARRACION.multiagente.texto, "Si tu negocio crece, separas tus líneas: ventas, soporte y cobros, cada una con los asesores que necesite. Cada asesor ve solo sus chats, con su propio embudo.");
            const lineas = [...html.matchAll(/data-linea="[^"]+"><div class="cabLinea"><span class="wa">[\s\S]*?<b>([^<]+)<\/b><span class="badge"[^>]*>(\d+) asesores<\/span>/g)].map((m) => `${m[1]} ${m[2]}`);
            assert.deepEqual(lineas, ["Ventas 6", "Soporte 3", "Cobros 2"]);
            const titulo = historia.CAPACIDADES.find((c) => c.escena === "multiagente");
            assert.deepEqual({ ...titulo }, { escena: "multiagente", titulo: "Trabaja en equipo", detalle: "Varias líneas y varios asesores" });
            assert.equal(historia.CAPACIDADES.indexOf(titulo) + 1, 13, "no es la escena 13");
            assert.match(guion, /`\/embudos\?asesor=\$\{sembrado\.asesor\}`/, "el embudo no se abre filtrado por la asesora");
            assert.ok(guion.indexOf('decir("multiagente")') > guion.indexOf('decir("reportes")') && guion.indexOf('decir("multiagente")') < guion.indexOf('decir("resumen")'));
            assert.ok(!("AVANZADAS" in historia), "siguen las fichas de «Y hay más»");
            assert.doesNotMatch(html, /Modo dueño|Operarios de campo/);
        });

        test("la hoja de Google Sheets y los reportes entran en el cuadro y en el panel", () => {
            assert.deepEqual(estudio.CAPAS_DEL_PORTATIL.map((c) => c.ruta), ["/chats", "/schedule", "/embudos", "/crm/reportes"]);
            assert.equal(historia.LA_HOJA.laura.length, historia.LA_HOJA.columnas.length);
            assert.match(html, /<div id="etSheets" class="etiqueta">/);
        });

        test("las capas del portátil que no se ven NO se rasterizan: visibility hidden, no solo transparentes", () => {
            // Con cuatro capas de la App a 1440×900 y solo opacity 0, el
            // compositor sin cabeza se queda sin memoria de raster y ninguna se
            // pinta: el portátil sale en blanco o con teselas viejas, sin error.
            const inactiva = html.match(/#portatil iframe \{([^}]*)\}/)?.[1] ?? "";
            const activa = html.match(/#portatil iframe\.on \{([^}]*)\}/)?.[1] ?? "";
            assert.match(inactiva, /visibility:\s*hidden/, "una capa escondida sigue rasterizándose");
            assert.match(inactiva, /visibility 0s linear \.6s/, "la que sale desaparece antes de acabar su fundido");
            assert.match(activa, /visibility:\s*visible/);
            assert.match(activa, /opacity:\s*1/);
        });
    });

    describe("5. la página pública", () => {
        test("promete lo mismo que el vídeo enseña", () => {
            assert.deepEqual(JSON.parse(JSON.stringify(pagina.CAPACIDADES_DEL_VIDEO)), JSON.parse(JSON.stringify(historia.CAPACIDADES)));
            assert.deepEqual({ ...pagina.LLAMADO_DEL_VIDEO }, { ...historia.LLAMADO });
        });

        test("nombra los mismos negocios que el vídeo, en su orden", () => {
            assert.deepEqual([...pagina.NEGOCIOS_DEL_VIDEO], historia.NEGOCIOS_DEL_ARRANQUE.map((n) => n.tipo));
            assert.equal(pagina.CIERRE_DE_LOS_NEGOCIOS, historia.CIERRE_DEL_MONTAJE);
            assert.equal(pagina.losNegociosEnUnaFrase(), "tienda en línea, clínica, cursos, consultoría, agencia de viajes y cualquier negocio que venda por WhatsApp");
            const src = leer("app/demo/page.tsx");
            assert.match(src, /losNegociosEnUnaFrase\(\)/);
            assert.doesNotMatch(src, /restaurante/, "la página sigue nombrando negocios que el vídeo ya no enseña");
        });

        test("el enlace de WhatsApp lleva el número limpio y el mensaje escrito", () => {
            assert.equal(pagina.elEnlaceDeWhatsapp("+57 311 561 6975", "Hola, ¿qué tal?"), "https://wa.me/573115616975?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F");
        });

        test("dice lo que es de verdad y lo que es recreación", () => {
            assert.match(pagina.LO_QUE_ES_EL_VIDEO, /panel es la plataforma real/);
            assert.match(pagina.LO_QUE_ES_EL_VIDEO, /recreaciones/);
            assert.match(pagina.LO_QUE_ES_EL_VIDEO, /guion/);
            assert.match(leer("app/demo/page.tsx"), /LO_QUE_ES_EL_VIDEO/);
        });

        test("es pública y no se indexa", () => {
            assert.match(leer("middleware.ts"), /currentPath === "\/demo"\s*\|\|\s*currentPath\.startsWith\("\/demo\/"\)/);
            const config = leer("next.config.js");
            assert.match(config, /source: "\/demo\/:path\*"/);
            assert.match(leer("app/demo/layout.tsx"), /index: false/);
        });
    });

    describe("6. el vídeo publicado", () => {
        const VIDEO = path.join(RAIZ, "public", "demo", "verzay-demo.mp4");
        const DATOS = path.join(RAIZ, "public", "demo", "verzay-demo.json");

        test("existe, con su portada y sus datos", () => {
            assert.ok(existsSync(VIDEO), "falta el vídeo: scripts/generar-video-de-ventas.sh");
            assert.ok(existsSync(path.join(RAIZ, "public", "demo", "verzay-demo.jpg")));
            assert.ok(existsSync(DATOS));
        });

        test("MP4 H.264 + AAC, 1920×1080 a 25 fps, y entre dos minutos y medio y tres", () => {
            const r = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt:format=duration,format_name", "-of", "json", VIDEO], { encoding: "utf8" }));
            const v = r.streams.find((s) => s.codec_type === "video");
            const a = r.streams.find((s) => s.codec_type === "audio");
            assert.equal(v.codec_name, "h264");
            assert.equal(v.pix_fmt, "yuv420p", "sin yuv420p Safari no lo reproduce");
            assert.equal(`${v.width}x${v.height}`, "1920x1080");
            assert.equal(v.r_frame_rate, "25/1");
            assert.equal(a.codec_name, "aac");
            const s = Number(r.format.duration);
            assert.ok(s >= 150 && s * 1000 < pagina.TOPE_DEL_VIDEO_DE_VENTAS_MS, `dura ${s.toFixed(1)} s`);
            const datos = JSON.parse(readFileSync(DATOS, "utf8"));
            assert.ok(Math.abs(s * 1000 - datos.duracionMs) < 1500, "el vídeo y sus datos no dicen lo mismo");
        });

        test("se decodifica entero sin un error, y arranca sin descargarlo todo", () => {
            // El Chromium de las pruebas no trae H.264, así que quien decodifica
            // el archivo entero es ffmpeg: un fotograma roto sale aquí.
            const errores = execFileSync("ffmpeg", ["-v", "error", "-i", VIDEO, "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
            assert.equal(errores.trim(), "", errores);
            // faststart: el índice (moov) va ANTES de los datos (mdat); si no, el
            // navegador tiene que bajar los 12 MB antes de enseñar un fotograma.
            const cabeza = readFileSync(VIDEO).subarray(0, 256 * 1024).toString("latin1");
            const moov = cabeza.indexOf("moov");
            const mdat = cabeza.indexOf("mdat");
            assert.ok(moov >= 0 && (mdat < 0 || moov < mdat), `moov en ${moov}, mdat en ${mdat}`);
        });

        test("se narró con Cedar y con el guion de hoy", () => {
            const datos = JSON.parse(readFileSync(DATOS, "utf8"));
            assert.equal(datos.voz, "cedar");
            const hoy = Object.fromEntries(Object.entries(narracion.NARRACION).map(([id, n]) => [id, cedar.llaveDeLaFrase(n.texto, narracion.VOZ_DE_VENTAS)]));
            assert.deepEqual(datos.frases, hoy, "el guion cambió y el vídeo no se regeneró");
        });

        test("se grabó con el arranque de hoy, y su cierre sale después de la última tarjeta, debajo de las cinco", () => {
            const datos = JSON.parse(readFileSync(DATOS, "utf8"));
            assert.deepEqual(datos.montaje?.tarjetas, historia.NEGOCIOS_DEL_ARRANQUE.map((n) => n.tipo), "el arranque cambió y el vídeo no se regeneró");
            assert.deepEqual(datos.montaje.medios, historia.NEGOCIOS_DEL_ARRANQUE.map((n) => n.medio));
            assert.equal(datos.montaje.cierre, historia.CIERRE_DEL_MONTAJE);
            // Antes del cierre, la frase de los cinco negocios; y todo antes de la marca.
            assert.ok(datos.montaje.cierreMs > 3000 && datos.montaje.cierreMs < 12000, `el cierre sale a los ${datos.montaje.cierreMs} ms`);
            // Y en la IMAGEN: en la franja de debajo de las tarjetas no hay nada
            // antes de su hora, y está el texto (blanco) después.
            const claros = (ms) => {
                const gris = execFileSync("ffmpeg", ["-v", "error", "-ss", (ms / 1000).toFixed(2), "-i", VIDEO, "-frames:v", "1", "-vf", "crop=880:44:520:878,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 8 << 20 });
                return gris.filter((b) => b > 200).length / gris.length;
            };
            const antes = claros(datos.montaje.cierreMs - 700);
            const despues = claros(datos.montaje.cierreMs + 1400);
            assert.ok(antes < 0.005, `el cierre ya se ve antes de su hora (${(antes * 100).toFixed(1)} % claro)`);
            assert.ok(despues > 0.04, `el cierre no se ve después de su hora (${(despues * 100).toFixed(1)} % claro)`);
        });

        test("en el vídeo publicado, la portada del video de Cursos y el mapa del viaje se ven: una imagen, no un recuadro negro", () => {
            const datos = JSON.parse(readFileSync(DATOS, "utf8"));
            const { cajas, cajasMs } = datos.montaje ?? {};
            assert.ok(cajas?.video && cajas?.mapa && cajasMs > 0, "el vídeo no dice dónde quedaron la portada y el mapa: se grabó con el guion de antes");
            const pixeles = ({ x, y, w, h }) => {
                const gris = execFileSync("ffmpeg", ["-v", "error", "-ss", (cajasMs / 1000).toFixed(2), "-i", VIDEO, "-frames:v", "1", "-vf", `crop=${w}:${h}:${x}:${y},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 8 << 20 });
                let suma = 0;
                let suma2 = 0;
                for (const b of gris) {
                    suma += b;
                    suma2 += b * b;
                }
                const media = suma / gris.length;
                return {
                    media: Math.round(media),
                    desviacion: Math.round(Math.sqrt(Math.max(0, suma2 / gris.length - media * media))),
                    negros: gris.filter((b) => b < 35).length / gris.length,
                    blancos: gris.filter((b) => b > 215).length / gris.length,
                };
            };
            const portada = pixeles(cajas.video);
            assert.ok(portada.negros < 0.2 && portada.media > 70 && portada.desviacion > 30, `la portada del video no enseña una imagen: ${JSON.stringify(portada)}`);
            // El botón de reproducir, en el centro de la portada: su triángulo blanco se ve.
            const lado = 32;
            const boton = pixeles({ x: Math.round(cajas.video.x + cajas.video.w / 2 - lado / 2), y: Math.round(cajas.video.y + cajas.video.h / 2 - lado / 2), w: lado, h: lado });
            assert.ok(boton.blancos > 0.05, `el botón de reproducir no enseña su triángulo: ${JSON.stringify(boton)}`);
            const mapa = pixeles(cajas.mapa);
            assert.ok(mapa.negros < 0.1 && mapa.media > 150, `el mapa no se ve: ${JSON.stringify(mapa)}`);
        });

        test("el primer fotograma es la portada (no negro) y la portada publicada es ese fotograma", () => {
            const datos = JSON.parse(readFileSync(DATOS, "utf8"));
            assert.ok(datos.portada?.hastaMs > 0, "el vídeo se grabó sin portada");
            const gris = (fuente, ss, crop) =>
                execFileSync("ffmpeg", ["-v", "error", ...(ss == null ? [] : ["-ss", ss]), "-i", fuente, "-frames:v", "1", "-vf", `${crop ? `crop=${crop},` : ""}format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 16 << 20 });
            const media = (g) => g.reduce((a, b) => a + b, 0) / g.length;
            for (const [fuente, ss] of [[VIDEO, "0"], [path.join(RAIZ, "public", "demo", "verzay-demo.jpg"), null]]) {
                const entero = gris(fuente, ss);
                assert.ok(media(entero) > 25, `${path.basename(fuente)} sale casi negra (${media(entero).toFixed(0)})`);
                // El botón de reproducir: un círculo blanco en el centro.
                const centro = gris(fuente, ss, "60:20:930:646");
                assert.ok(centro.filter((b) => b > 215).length / centro.length > 0.5, `${path.basename(fuente)} no enseña el botón de reproducir`);
            }
        });

        test("la marca entra con movimiento en cuanto acaba el arranque, y las líneas del equipo se ven", () => {
            const datos = JSON.parse(readFileSync(DATOS, "utf8"));
            assert.ok(datos.marcaMs > 0 && datos.lineasMs > 0, "el vídeo se grabó sin las marcas de tiempo de la marca y del equipo");
            const foto = (ms) => execFileSync("ffmpeg", ["-v", "error", "-ss", (ms / 1000).toFixed(2), "-i", VIDEO, "-frames:v", "1", "-vf", "scale=240:135,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 8 << 20 });
            const dif = (a, b) => a.reduce((t, x, i) => t + Math.abs(x - b[i]), 0) / a.length;
            // Mientras entra la marca la imagen se mueve, y en un segundo ya cambió la escena entera.
            assert.ok(dif(foto(datos.marcaMs + 250), foto(datos.marcaMs + 450)) > 0.5, "la marca entra quieta");
            assert.ok(dif(foto(datos.marcaMs - 300), foto(datos.marcaMs + 1000)) > 8, "en un segundo la marca todavía no está");
            // La marca ya está antes de un segundo.
            const narr = datos.colocados.find((c) => c.texto === narracion.NARRACION.promesa.texto);
            const gancho = datos.colocados.find((c) => c.texto === narracion.NARRACION.gancho.texto);
            assert.ok(narr.inicioMs - gancho.finMs < 700, `entre el gancho y la promesa hay ${narr.inicioMs - gancho.finMs} ms`);
            assert.ok(dif(foto(datos.lineasMs - 400), foto(datos.lineasMs + 1800)) > 8, "las líneas del equipo no salen en pantalla");
        });

        test("suena, arranca con la voz y no tiene huecos mudos", () => {
            const r = spawnSync("ffmpeg", ["-hide_banner", "-i", VIDEO, "-map", "0:a:0", "-af", "silencedetect=noise=-40dB:d=0.35", "-f", "null", "-"], { encoding: "utf8" });
            const inicios = [...r.stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
            const finales = [...r.stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ fin: Number(m[1]), dura: Number(m[2]) }));
            const duracion = Number(JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", VIDEO], { encoding: "utf8" })).format.duration);
            const silencios = inicios.map((inicio, i) => ({ inicio, fin: finales[i]?.fin ?? duracion, dura: finales[i]?.dura ?? duracion - inicio }));
            const alEmpezar = silencios[0] && silencios[0].inicio < 0.05 ? silencios[0].dura : 0;
            assert.ok(alEmpezar <= 0.8, `${alEmpezar.toFixed(2)} s mudos al empezar`);
            const dentro = silencios.filter((x) => x.inicio >= 0.05 && x.fin < duracion - 0.2);
            for (const x of dentro) assert.ok(x.dura <= 2.8, `un hueco de ${x.dura.toFixed(2)} s en ${x.inicio.toFixed(1)} s`);
            const alFinal = silencios.find((x) => x.fin >= duracion - 0.2);
            assert.ok(!alFinal || alFinal.dura <= 4.2, `${alFinal?.dura.toFixed(2)} s mudos al final`);
            const vol = /mean_volume:\s*(-?[\d.]+) dB/.exec(spawnSync("ffmpeg", ["-hide_banner", "-i", VIDEO, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr);
            assert.ok(vol && Number(vol[1]) > -26, "la pista suena demasiado baja");
        });

        test("en el vídeo publicado, la agenda, el embudo y los reportes se pintan en el portátil, cada uno el suyo", () => {
            // Con las capas escondidas solo transparentes, al entrar la cuarta el
            // portátil salía en blanco o con las teselas de otra pantalla. Se mira
            // la pantalla del portátil al final de cada frase: tiene contenido
            // (no es un blanco liso) y las tres son distintas entre sí.
            const datos = JSON.parse(readFileSync(DATOS, "utf8"));
            const { portatil } = estudio.PLANOS.panel;
            const P = estudio.PORTATIL;
            const caja = {
                x: Math.round(portatil.x + P.lado * portatil.s),
                y: Math.round(portatil.y + (P.arriba + P.barra) * portatil.s),
                w: Math.round(P.pantalla.ancho * portatil.s),
                h: Math.round(P.pantalla.alto * portatil.s),
            };
            const alFinalDe = (id) => {
                const c = datos.colocados.find((x) => x.clase === "narracion" && x.texto === narracion.NARRACION[id].texto);
                assert.ok(c, `el vídeo no dice cuándo sonó «${id}»`);
                return c.finMs - 600;
            };
            const pantalla = (ms) =>
                execFileSync("ffmpeg", ["-v", "error", "-ss", (ms / 1000).toFixed(2), "-i", VIDEO, "-frames:v", "1", "-vf", `crop=${caja.w}:${caja.h}:${caja.x}:${caja.y},scale=310:194,format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 8 << 20 });
            const vistas = Object.fromEntries(["cita", "embudo", "reportes"].map((id) => [id, pantalla(alFinalDe(id))]));
            for (const [id, g] of Object.entries(vistas)) {
                const media = g.reduce((a, b) => a + b, 0) / g.length;
                const desviacion = Math.sqrt(g.reduce((a, b) => a + (b - media) ** 2, 0) / g.length);
                assert.ok(desviacion > 12, `en «${id}» el portátil sale liso (desviación ${desviacion.toFixed(1)})`);
            }
            const ids = Object.keys(vistas);
            for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                    const a = vistas[ids[i]];
                    const b = vistas[ids[j]];
                    let dif = 0;
                    for (let k = 0; k < a.length; k++) dif += Math.abs(a[k] - b[k]);
                    assert.ok(dif / a.length > 8, `«${ids[i]}» y «${ids[j]}» enseñan la misma pantalla`);
                }
            }
        });
    });
}
