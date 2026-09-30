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
 *   3. La historia, el estudio y la banda sonora (puros): cada mensaje sale con
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

        test("catorce mensajes, M01 a M14, en orden y con hora", () => {
            assert.deepEqual(conversacion.map((m) => m.id), Array.from({ length: 14 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`));
            for (let i = 1; i < conversacion.length; i += 1) assert.ok(conversacion[i].en >= conversacion[i - 1].en, `${conversacion[i].id} va antes que ${conversacion[i - 1].id}`);
        });

        test("cada mensaje sale con la forma que el panel pinta, y su aviso en vivo con el MISMO id", () => {
            const tipos = { texto: "conversation", nota: "audioMessage", documento: "documentMessage", video: "videoMessage", imagen: "imageMessage" };
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

        test("ninguna pantalla pisa el rótulo de arriba ni los subtítulos, ni se sale del cuadro", () => {
            for (const [nombre, plano] of Object.entries(estudio.PLANOS)) {
                for (const pantalla of ["tel", "web", "portatil"]) {
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

    describe("5. la página pública", () => {
        test("promete lo mismo que el vídeo enseña", () => {
            assert.deepEqual(JSON.parse(JSON.stringify(pagina.CAPACIDADES_DEL_VIDEO)), JSON.parse(JSON.stringify(historia.CAPACIDADES)));
            assert.deepEqual({ ...pagina.LLAMADO_DEL_VIDEO }, { ...historia.LLAMADO });
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

        test("MP4 H.264 + AAC, 1920×1080 a 25 fps, y menos de dos minutos", () => {
            const r = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt:format=duration,format_name", "-of", "json", VIDEO], { encoding: "utf8" }));
            const v = r.streams.find((s) => s.codec_type === "video");
            const a = r.streams.find((s) => s.codec_type === "audio");
            assert.equal(v.codec_name, "h264");
            assert.equal(v.pix_fmt, "yuv420p", "sin yuv420p Safari no lo reproduce");
            assert.equal(`${v.width}x${v.height}`, "1920x1080");
            assert.equal(v.r_frame_rate, "25/1");
            assert.equal(a.codec_name, "aac");
            const s = Number(r.format.duration);
            assert.ok(s * 1000 < pagina.TOPE_DEL_VIDEO_DE_VENTAS_MS, `dura ${s.toFixed(1)} s`);
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
    });
}
