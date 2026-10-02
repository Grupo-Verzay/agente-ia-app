/**
 * El VÍDEO DE APERTURA DEL CANAL DE YOUTUBE: «Mientras tú dormías, esto pasó
 * con un cliente» (`public/demo/verzay-youtube.mp4`).
 *
 * Es un corte del vídeo de ventas (`/demo`): la misma Laura, las mismas tres
 * pantallas y el panel de verdad, grabados con el MISMO rodaje
 * (`scripts/video-de-ventas/rodaje.mjs`). Lo que el guion pidió distinto es lo
 * que este banco protege:
 *
 *   1. La voz dice el guion, palabra por palabra, una frase por escena y en su
 *      orden; está entera en su propia caché (Cedar) y no sobra nada.
 *   2. La historia pasa DE NOCHE: Laura escribe a las nueve, la IA insiste a
 *      las dos horas y la llama al día siguiente por la tarde; la cita es el
 *      jueves a las diez, que es la que se confirma en la llamada. Y el vídeo
 *      de ventas sigue exactamente como estaba (de día).
 *   3. El grabador: arranca con CORTES de los cinco chats —sin portada, sin la
 *      escena de la marca—; la llamada va entera y sin narración encima; entre
 *      el embudo y las varias líneas hay un respiro, y el logo sale solo al
 *      final.
 *   4. El vídeo publicado: MP4 H.264 + AAC 1920×1080, con el guion de hoy, la
 *      llamada entera y seguida, el respiro de verdad en la pista, las líneas
 *      en pantalla y sin otros huecos mudos.
 *
 * `MODO=roto` mira ANTES_REF —pinchado a un commit, nunca `origin/main`— y
 * afirma el fallo: no había corte de YouTube, la historia no sabía pasar de
 * noche, el estudio no sabía cortar ni poner la luna, y el vídeo de ventas
 * —lo único que había— abre con la portada y la marca.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const MODO = process.env.MODO ?? "bueno";
const ANTES = process.env.ANTES_REF ?? "7a0d1ac";
const leer = (ruta) => readFileSync(path.join(RAIZ, ruta), "utf8");
const existiaEn = (ruta) => spawnSync("git", ["cat-file", "-e", `${ANTES}:${ruta}`], { cwd: RAIZ }).status === 0;
const deAntes = (ruta) => execFileSync("git", ["show", `${ANTES}:${ruta}`], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 << 20 });

/** Lo que dice la voz, tal cual lo escribió el guion (escenas 1 a 12, sin la llamada). */
const EL_GUION = [
    "Cada minuto sin respuesta es una venta que se enfría. Tiendas, clínicas, cursos, consultorías, agencias de viajes… y cualquier negocio que venda por WhatsApp, responde al instante.",
    "Son las nueve de la noche. En la clínica ya no hay nadie despierto. Pero Laura sí está escribiendo.",
    "La IA responde al instante, le da el precio, y sin que nadie lo haga a mano, su ficha ya está completa.",
    "Si Laura prefiere mandar un audio, la IA lo escucha y le contesta también con voz.",
    "Todo lo que Laura cuenta queda guardado también en tu hoja de cálculo, sin que nadie lo escriba.",
    "Le manda el PDF, el video, entiende la foto que ella envía, y como ya está interesada, queda marcada como cliente caliente, sin que nadie la etiquete a mano.",
    "Si Laura se queda callada, la IA no la deja ir: insiste con texto, y si hace falta, hasta la llama.",
    "La cita queda en el calendario, y un día antes, el recordatorio sale solo. Laura confirma, y tú lo sabes al instante.",
    "Y si en algún momento Laura necesita hablar con una persona, la IA la pasa directo con tu equipo.",
    "Esto no fue un tutorial, fue un día cualquiera para un cliente real.",
    "Y si tu negocio crece, Verzay crece contigo: varias líneas, varios asesores, un solo panel.",
    "Escríbenos por WhatsApp o agenda una cita. Los enlaces están en la descripción.",
];

if (MODO === "roto") {
    describe(`MODO=roto: en ${ANTES} no había corte de YouTube`, () => {
        test("no había grabador, ni narración, ni vídeo publicado", () => {
            for (const ruta of ["scripts/grabar-video-de-youtube.mjs", "scripts/video-de-youtube/narracion.mjs", "scripts/video-de-ventas/rodaje.mjs", "public/demo/verzay-youtube.mp4"]) {
                assert.equal(existiaEn(ruta), false, `${ruta} ya existía en ${ANTES}`);
            }
        });

        test("la historia no sabía pasar de noche: Laura escribía siempre por la mañana", () => {
            const hist = deAntes("scripts/video-de-ventas/historia.mjs");
            assert.ok(!hist.includes("deNoche"), "la historia ya sabía pasar de noche");
            assert.match(hist, /inicio: aLas\(martes, 9, 40\)/);
        });

        test("el estudio no sabía cortar los cinco chats ni poner el cartel de la noche", () => {
            const est = deAntes("scripts/video-de-ventas/estudio.mjs");
            // El cartel del tiempo ya existía (el vídeo de ventas lo usa); lo
            // nuevo es su luna, la de «En la clínica ya no hay nadie».
            assert.ok(!/\bluna:/.test(est), "el estudio ya tenía la luna de la noche");
            assert.ok(!/#montaje\.cortes/.test(est), "el estudio ya sabía cortar");
            assert.ok(!est.includes("sinLema"), "el cierre ya sabía salir sin su frase");
        });

        test("lo único que había —el vídeo de ventas— abre con la portada y la marca antes de la historia", () => {
            // Es lo que el guion pide quitar: el logo, solo al final.
            const g = deAntes("scripts/grabar-video-de-ventas.mjs");
            const portada = g.indexOf("await est(\"plano\", PLANOS.portada");
            const marca = g.indexOf("await est(\"plano\", PLANOS.marca");
            const tres = g.indexOf("await est(\"plano\", PLANOS.tres");
            assert.ok(portada >= 0 && marca > portada && tres > marca, "el vídeo de ventas ya no abría con la marca");
        });
    });
} else {
    const historia = await import("../../scripts/video-de-ventas/historia.mjs");
    const estudio = await import("../../scripts/video-de-ventas/estudio.mjs");
    const ventas = await import("../../scripts/video-de-ventas/narracion.mjs");
    const youtube = await import("../../scripts/video-de-youtube/narracion.mjs");
    const cedar = await import("../../scripts/voz-cedar.mjs");
    const guion = leer("scripts/grabar-video-de-youtube.mjs");
    const constante = (nombre) => Number(new RegExp(`export const ${nombre} = ([\\d_]+);`).exec(guion)?.[1].replaceAll("_", ""));
    const ESCENAS = JSON.parse(/export const ESCENAS_DE_YOUTUBE = Object\.freeze\((\[[\s\S]*?\])\);/.exec(guion)[1].replace(/,\s*\]/, "]"));

    describe("1. la voz dice el guion", () => {
        test("la narración es el guion, palabra por palabra y en su orden", () => {
            assert.deepEqual(Object.values(youtube.NARRACION_DE_YOUTUBE).map((n) => n.texto), EL_GUION);
            assert.equal(youtube.TITULO_DE_YOUTUBE, "Mientras tú dormías, esto pasó con un cliente");
        });

        test("la descripción lleva los dos enlaces del llamado, los mismos de /demo", () => {
            // «Escríbenos por WhatsApp o agenda una cita. Los enlaces están en la descripción.»
            const pagina = leer("lib/video-de-ventas.ts");
            const numero = /whatsapp:\s*"(\d+)"/.exec(pagina)[1];
            const agendar = /agendar:\s*"([^"]+)"/.exec(pagina)[1];
            const { ENLACES_DE_YOUTUBE: e, DESCRIPCION_DE_YOUTUBE: d } = youtube;
            assert.ok(e.whatsapp.startsWith(`https://wa.me/${numero}?text=`), e.whatsapp);
            assert.equal(e.agendar, agendar);
            assert.ok(d.includes(e.whatsapp) && d.includes(e.agendar), "la descripción no lleva los dos enlaces");
            assert.ok(d.includes("Responde, vende, agenda y hace seguimiento. 24/7."));
        });

        test("la llamada va entera: Sofía saluda, ofrece los cupos, Laura elige, Sofía confirma el jueves a las diez y se despiden", () => {
            const l = youtube.LA_LLAMADA_COMPLETA;
            assert.ok(l.length >= 6, `la llamada tiene ${l.length} frases`);
            l.forEach((x, i) => assert.equal(x.quien, i % 2 === 0 ? "ia" : "clienta", `la frase ${i + 1} no alterna`));
            assert.match(l[0].texto, /Sofía/);
            assert.match(l[0].texto, /Laura/);
            assert.ok(l.some((x) => x.quien === "ia" && /cupos/.test(x.texto)), "Sofía no ofrece los cupos");
            const confirma = l.findIndex((x) => x.quien === "ia" && /jueves a las diez/.test(x.texto) && /agendada/.test(x.texto));
            assert.ok(confirma > 0, "Sofía no confirma el jueves a las diez");
            assert.ok(l.slice(confirma + 1).some((x) => /[Gg]racias/.test(x.texto)), "no se agradece después de confirmar");
        });

        test("todo está sintetizado con Cedar en su propia caché, y no sobra nada", () => {
            assert.equal(ventas.VOZ_DE_VENTAS.voz, "cedar");
            const textos = youtube.loQueSeSintetiza();
            const faltan = textos.filter((t) => !existsSync(cedar.rutaDeLaFrase(t.texto, youtube.CACHE_DE_YOUTUBE, t.voz)));
            assert.deepEqual(faltan.map((t) => t.texto), [], "falta sintetizar (desde el contenedor de la App)");
            const esperadas = new Set(textos.map((t) => path.basename(cedar.rutaDeLaFrase(t.texto, youtube.CACHE_DE_YOUTUBE, t.voz))));
            const sobran = readdirSync(youtube.CACHE_DE_YOUTUBE).filter((f) => f.endsWith(".ogg") && !esperadas.has(f));
            assert.deepEqual(sobran, [], "una frase que ya no se dice sigue en la caché");
        });

        test("las voces de la llamada son las del vídeo de ventas: Sofía y Laura suenan igual en los dos", () => {
            for (const l of youtube.LA_LLAMADA_COMPLETA) assert.equal(youtube.loQueSeSintetiza().find((t) => t.texto === l.texto).voz, ventas.LA_VOZ_EN_LA_LLAMADA[l.quien]);
        });
    });

    describe("2. la historia, de noche", () => {
        const ahora = Date.UTC(2026, 8, 28, 15, 0);
        const noche = historia.elCalendario(ahora, { deNoche: true });
        const dia = historia.elCalendario(ahora);

        test("Laura escribe un lunes a las nueve de la noche, y la IA insiste a las dos horas", () => {
            assert.equal(historia.laHora(noche.inicio), "9:00 p. m.");
            assert.match(historia.elDia(noche.inicio), /^lunes/);
            const minutos = (noche.seguimiento - noche.inicio) / 60_000;
            assert.ok(minutos >= 120 && minutos < 150, `insiste a los ${minutos} min`);
        });

        test("la llama al día siguiente por la tarde, y la cita es la que se confirma en la llamada", () => {
            assert.match(historia.elDia(noche.llamada), /^martes/);
            assert.match(historia.laHora(noche.llamada), /p\. m\.$/);
            assert.match(historia.elDia(noche.cita), /^jueves/);
            assert.equal(historia.laHora(noche.cita), "10:00 a. m.");
            assert.equal(noche.cupos[0].horas[0], noche.cita, "el primer cupo que ofrece Sofía no es la cita");
            assert.equal(noche.cita - noche.recordatorio, 86_400_000, "el recordatorio no sale un día antes");
        });

        test("nada de la historia queda en el pasado, y ninguna cita de la agenda cae de madrugada", () => {
            assert.ok(noche.inicio > ahora);
            const hora = (t) => Number(new Intl.DateTimeFormat("en-US", { timeZone: historia.ZONA, hour: "numeric", hourCycle: "h23" }).format(new Date(t)));
            for (const t of [noche.referencia, noche.llamada, noche.recordatorio, noche.cita, ...noche.cupos.flatMap((c) => c.horas)]) {
                assert.ok(hora(t) >= 8 && hora(t) <= 19, `una hora de la agenda cae a las ${hora(t)}`);
            }
        });

        test("el vídeo de ventas sigue de día, como estaba", () => {
            assert.equal(dia.inicio, dia.referencia);
            assert.equal(historia.laHora(dia.inicio), "9:40 a. m.");
            // Las horas de antes, una por una (la de noche puede caer otra
            // semana a propósito: su lunes nunca queda en el pasado).
            const cuando = (t) => `${historia.elDia(t).split(" ")[0]} ${historia.laHora(t)}`;
            assert.equal(cuando(dia.inicio), "martes 9:40 a. m.");
            assert.equal(cuando(dia.seguimiento), "martes 11:46 a. m.");
            assert.equal(cuando(dia.llamada), "martes 3:30 p. m.");
            assert.equal(cuando(dia.recordatorio), "miércoles 10:00 a. m.");
            assert.equal(cuando(dia.cita), "jueves 10:00 a. m.");
            assert.equal(dia.inicio - ahora < 2 * 86_400_000, true, "el martes de día es el siguiente, como antes");
        });
    });

    describe("3. el grabador", () => {
        test("dice cada frase UNA vez y en el orden del guion, y cada alDecir cae en la frase que suena", () => {
            const dichas = [...guion.matchAll(/await decir\("(\w+)"\)/g)].map((m) => m[1]);
            assert.deepEqual(dichas, Object.keys(youtube.NARRACION_DE_YOUTUBE));
            let actual = null;
            for (const linea of guion.split("\n")) {
                const d = /await decir\("(\w+)"\)/.exec(linea);
                if (d) actual = youtube.NARRACION_DE_YOUTUBE[d[1]].texto;
                const a = /await alDecir\("([^"]+)"/.exec(linea);
                if (a) assert.ok(actual?.includes(a[1]), `«${a[1]}» no está en «${actual}»`);
            }
        });

        test("cada mensaje llega una vez, y cada escena se rotula con su capacidad del vídeo de ventas", () => {
            const llegan = [...guion.matchAll(/await llega\("(M\d\d)"/g)].map((m) => m[1]);
            assert.deepEqual(llegan, historia.laConversacion(historia.elCalendario(0, { deNoche: true })).map((m) => m.id));
            const rotuladas = [...guion.matchAll(/await capacidad\("(\w+)"\)/g)].map((m) => m[1]);
            assert.deepEqual(rotuladas, ESCENAS);
            for (const e of ESCENAS) assert.ok(historia.CAPACIDADES.some((c) => c.escena === e), `«${e}» no es una capacidad del vídeo de ventas`);
        });

        test("graba con el rodaje del vídeo de ventas, de noche y sin recordVideo", () => {
            assert.match(guion, /await elRodaje\(\{/);
            assert.match(guion, /elCalendario\(ahora, \{ deNoche: true \}\)/);
            assert.doesNotMatch(guion, /recordVideo/, "recordVideo estira el vídeo y lo despega de la voz");
        });

        test("arranca con cortes de los cinco chats: ni portada, ni escena de la marca", () => {
            assert.doesNotMatch(guion, /PLANOS\.(portada|marca)\b/, "el logo sale al principio");
            assert.doesNotMatch(guion, /await est\("montaje"/, "el montaje animado del vídeo de ventas no va en el corte");
            const entrar = guion.indexOf('await est("cortes.entrar")');
            const grabar = guion.indexOf("await grabar(p, mudo");
            assert.ok(entrar >= 0 && entrar < grabar, "los cortes no están puestos en el primer fotograma");
            const cortes = [...guion.matchAll(/await est\("cortes\.solo", i\)/g)];
            assert.equal(cortes.length, 1, "un corte por negocio, en un bucle");
            assert.match(guion, /PALABRAS_DEL_GANCHO\.length !== NEGOCIOS_DEL_ARRANQUE\.length\) throw/, "el gancho puede nombrar otros negocios que las tarjetas");
            const palabras = JSON.parse(/const PALABRAS_DEL_GANCHO = (\[[^\]]+\]);/.exec(guion)[1]);
            for (const pal of palabras) assert.ok(youtube.NARRACION_DE_YOUTUBE.gancho.texto.includes(pal), `«${pal}» no se dice en el gancho`);
            assert.equal(palabras.length, historia.NEGOCIOS_DEL_ARRANQUE.length);
        });

        test("la llamada va entera y sin narración encima, con el celular en el centro", () => {
            const desde = guion.indexOf('await est("llamada", "hablando")');
            const hasta = guion.indexOf('await est("llamada", null)');
            assert.ok(desde > 0 && hasta > desde);
            const dentro = guion.slice(desde, hasta);
            assert.doesNotMatch(dentro, /await decir\(/, "se narra encima de la llamada");
            assert.match(dentro, /for \(const \[i, l\] of EN_LA_LLAMADA\.entries\(\)\)/, "no suenan todas las frases de la llamada");
            const tel = JSON.parse(/PLANO_DE_LA_LLAMADA = Object\.freeze\((\{[^)]+\})\);/.exec(guion)[1].replace(/(\w+):/g, '"$1":'));
            const ancho = estudio.TEL.ancho * tel.tel.s;
            assert.ok(Math.abs(tel.tel.x + ancho / 2 - 960) < 20, "el celular no va en el centro");
            assert.ok(tel.tel.y >= 0 && tel.tel.y + estudio.TEL.alto * tel.tel.s <= 1080, "el celular se sale de la pantalla");
        });

        test("entre el embudo y las varias líneas hay un respiro, y el logo sale solo al final", () => {
            const respiro = constante("RESPIRO_ANTES_DE_LAS_LINEAS_MS");
            assert.ok(respiro >= 1500 && respiro <= 3000, `respiro de ${respiro} ms`);
            const unDia = guion.indexOf('await decir("unDia")');
            const pausa = guion.indexOf("await espera(p, RESPIRO_ANTES_DE_LAS_LINEAS_MS)");
            const lineas = guion.indexOf('await est("plano", PLANOS.lineas');
            const crece = guion.indexOf('await decir("crece")');
            const cierre = guion.indexOf('await est("plano", PLANOS.cierre');
            assert.ok(unDia < pausa && pausa < lineas && lineas < crece && crece < cierre, "el orden del final no es embudo → respiro → líneas → marca");
            assert.equal([...guion.matchAll(/PLANOS\.cierre/g)].length, 1, "el logo sale más de una vez");
            assert.match(guion.slice(cierre), /await decir\("llamado"\)/, "el llamado no va con la marca");
        });
    });

    describe("4. el vídeo publicado", () => {
        const VIDEO = path.join(RAIZ, "public", "demo", "verzay-youtube.mp4");
        const DATOS = path.join(RAIZ, "public", "demo", "verzay-youtube.json");
        const datos = existsSync(DATOS) ? JSON.parse(readFileSync(DATOS, "utf8")) : null;
        const foto = (ms) => execFileSync("ffmpeg", ["-v", "error", "-ss", (ms / 1000).toFixed(2), "-i", VIDEO, "-frames:v", "1", "-vf", "scale=240:135,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 8 << 20 });
        const dif = (a, b) => a.reduce((t, x, i) => t + Math.abs(x - b[i]), 0) / a.length;
        const media = (g) => g.reduce((a, b) => a + b, 0) / g.length;
        const narrada = (id) => datos.colocados.find((c) => c.clase === "narracion" && c.texto === youtube.NARRACION_DE_YOUTUBE[id].texto);

        test("existe, con su miniatura y sus datos", () => {
            assert.ok(existsSync(VIDEO), "falta el vídeo: scripts/generar-video-de-youtube.sh");
            assert.ok(existsSync(path.join(RAIZ, "public", "demo", "verzay-youtube.jpg")));
            assert.ok(datos);
        });

        test("MP4 H.264 + AAC, 1920×1080 a 25 fps, y entre dos y cuatro minutos (la duración es libre: manda el ritmo)", () => {
            const r = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt:format=duration", "-of", "json", VIDEO], { encoding: "utf8" }));
            const v = r.streams.find((s) => s.codec_type === "video");
            const a = r.streams.find((s) => s.codec_type === "audio");
            assert.equal(v.codec_name, "h264");
            assert.equal(v.pix_fmt, "yuv420p");
            assert.equal(`${v.width}x${v.height}`, "1920x1080");
            assert.equal(v.r_frame_rate, "25/1");
            assert.equal(a.codec_name, "aac");
            const s = Number(r.format.duration);
            assert.ok(s >= 120 && s <= 240, `dura ${s.toFixed(1)} s`);
            assert.ok(Math.abs(s * 1000 - datos.duracionMs) < 1500, "el vídeo y sus datos no dicen lo mismo");
            const errores = execFileSync("ffmpeg", ["-v", "error", "-i", VIDEO, "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
            assert.equal(errores.trim(), "", errores);
        });

        test("se narró con Cedar y con el guion de hoy, y lleva su título", () => {
            assert.equal(datos.voz, "cedar");
            const hoy = Object.fromEntries(Object.entries(youtube.NARRACION_DE_YOUTUBE).map(([id, n]) => [id, cedar.llaveDeLaFrase(n.texto, ventas.VOZ_DE_VENTAS)]));
            assert.deepEqual(datos.frases, hoy, "el guion cambió y el vídeo no se regeneró");
            assert.equal(datos.titulo, youtube.TITULO_DE_YOUTUBE);
            assert.equal(datos.descripcion, youtube.DESCRIPCION_DE_YOUTUBE);
            assert.deepEqual(datos.gancho?.negocios, historia.NEGOCIOS_DEL_ARRANQUE.map((n) => n.id));
        });

        test("arranca con los chats y con la voz: ni negro, ni portada muda", () => {
            assert.ok(media(foto(0)) > 25, "el primer fotograma sale casi negro");
            const gancho = narrada("gancho");
            assert.ok(gancho && gancho.inicioMs < 900, `la voz empieza a los ${gancho?.inicioMs} ms`);
            // Los cortes: se mira la franja del RÓTULO del negocio («Tienda en
            // línea», «Clínica»…), que solo cambia cuando cambia el chat. Los
            // mensajes que llegan mientras tanto no la tocan. Del mosaico de los
            // cinco a cada uno en solitario, de uno a otro, y de vuelta a los
            // cinco ya contestados: una entrada, cuatro cortes y una salida.
            const rotulo = (ms) => execFileSync("ffmpeg", ["-v", "error", "-ss", (ms / 1000).toFixed(2), "-i", VIDEO, "-frames:v", "1", "-vf", "crop=640:110:640:790,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 8 << 20 });
            const cortes = [];
            let antes = rotulo(200);
            for (let ms = 280; ms <= gancho.finMs; ms += 80) {
                const ahora = rotulo(ms);
                if (dif(antes, ahora) > 3) cortes.push(ms);
                antes = ahora;
            }
            assert.equal(cortes.length, historia.NEGOCIOS_DEL_ARRANQUE.length + 1, `cortes del gancho: ${cortes.join(", ")}`);
            for (let i = 1; i < cortes.length; i++) {
                assert.ok(cortes[i] - cortes[i - 1] <= 1_500, `un corte del gancho dura ${cortes[i] - cortes[i - 1]} ms: no es rápido`);
            }
        });

        test("la llamada suena entera y seguida, sin narración en medio", () => {
            const enLaLlamada = datos.colocados.filter((c) => c.clase === "llamada");
            assert.deepEqual(enLaLlamada.map((c) => c.texto), youtube.LA_LLAMADA_COMPLETA.map((l) => l.texto));
            const desde = enLaLlamada[0].inicioMs;
            const hasta = enLaLlamada.at(-1).finMs;
            assert.ok(hasta - desde >= 30_000, `la llamada dura ${((hasta - desde) / 1000).toFixed(1)} s`);
            const encima = datos.colocados.filter((c) => c.clase === "narracion" && c.finMs > desde && c.inicioMs < hasta);
            assert.deepEqual(encima.map((c) => c.texto), [], "se narra encima de la llamada");
            for (let i = 1; i < enLaLlamada.length; i += 1) assert.ok(enLaLlamada[i].inicioMs - enLaLlamada[i - 1].finMs < 900, `un silencio largo en la llamada antes de «${enLaLlamada[i].texto}»`);
        });

        test("el respiro entre el embudo y las varias líneas está en la pista, y las líneas se ven", () => {
            const unDia = narrada("unDia");
            const crece = narrada("crece");
            assert.ok(crece.inicioMs - unDia.finMs >= datos.respiroAntesDeLasLineasMs, `entre el embudo y las líneas hay ${crece.inicioMs - unDia.finMs} ms`);
            assert.ok(crece.inicioMs - unDia.finMs <= 4_000, "el respiro es una pausa larga");
            assert.ok(datos.lineasMs > unDia.finMs && datos.marcaMs > datos.lineasMs);
            assert.ok(dif(foto(datos.lineasMs - 400), foto(datos.lineasMs + 1800)) > 8, "las líneas del equipo no salen en pantalla");
            assert.ok(dif(foto(datos.marcaMs - 300), foto(datos.marcaMs + 1500)) > 8, "la marca no entra al final");
        });

        test("suena, y aparte del respiro no tiene huecos mudos", () => {
            const r = spawnSync("ffmpeg", ["-hide_banner", "-i", VIDEO, "-map", "0:a:0", "-af", "silencedetect=noise=-40dB:d=0.35", "-f", "null", "-"], { encoding: "utf8" });
            const inicios = [...r.stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
            const finales = [...r.stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ fin: Number(m[1]), dura: Number(m[2]) }));
            const duracion = datos.duracionMs / 1000;
            const silencios = inicios.map((inicio, i) => ({ inicio, fin: finales[i]?.fin ?? duracion, dura: finales[i]?.dura ?? duracion - inicio }));
            const alEmpezar = silencios[0] && silencios[0].inicio < 0.05 ? silencios[0].dura : 0;
            assert.ok(alEmpezar <= 0.9, `${alEmpezar.toFixed(2)} s mudos al empezar`);
            const respiro = narrada("unDia").finMs / 1000;
            for (const x of silencios.filter((s) => s.inicio >= 0.05 && s.fin < duracion - 0.3)) {
                if (Math.abs(x.inicio - respiro) < 0.8) continue;
                assert.ok(x.dura <= 2.8, `un hueco de ${x.dura.toFixed(2)} s en ${x.inicio.toFixed(1)} s`);
            }
            const vol = /mean_volume:\s*(-?[\d.]+) dB/.exec(spawnSync("ffmpeg", ["-hide_banner", "-i", VIDEO, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr);
            assert.ok(vol && Number(vol[1]) > -26, "la pista suena demasiado baja");
        });
    });
}
