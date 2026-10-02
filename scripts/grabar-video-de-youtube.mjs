#!/usr/bin/env node
/**
 * Graba el VÍDEO DE APERTURA DEL CANAL DE YOUTUBE: «Mientras tú dormías, esto
 * pasó con un cliente». Es un CORTE del vídeo de ventas (`/demo`), no otro
 * vídeo: la misma Clínica Sonríe, la misma Laura, las mismas tres pantallas y
 * el panel de Verzay DE VERDAD, con la voz Cedar de las guías.
 *
 * Lo que cambia respecto a `/demo`, y es todo lo que vive aquí:
 *   - el guion (`video-de-youtube/narracion.mjs`): la historia pasa DE NOCHE,
 *     con la clínica cerrada (`elCalendario(..., { deNoche: true })`);
 *   - el gancho son CORTES rápidos de los cinco chats, sin título grande ni la
 *     escena de la marca: el logo sale solo al final;
 *   - la llamada con IA va ENTERA, con el celular en el centro y sin narración
 *     encima;
 *   - el cierre abre a varias líneas y asesores trabajando a la vez, con un
 *     respiro antes, y de ahí sale la marca.
 *
 * Lo demás —sembrar la clínica, abrir el estudio y el panel, que llegue un
 * mensaje, la narración y el MP4— es `video-de-ventas/rodaje.mjs`, el mismo
 * que usa el vídeo de ventas. Lo arranca `generar-video-de-youtube.sh`. Con
 * `ENSAYO=1` todo queda en el directorio de trabajo, con una captura por
 * escena, y `public/demo/` no se toca.
 */
import { grabar } from "./grabadora-de-la-guia.mjs";
import { espera } from "./taller-de-la-guia.mjs";
import { PLANOS } from "./video-de-ventas/estudio.mjs";
import { ASESORA, CAPACIDADES, CLIENTA, NEGOCIOS_DEL_ARRANQUE, SECCION_DE_LA_FICHA, elCalendario, elDia, laHora } from "./video-de-ventas/historia.mjs";
import { ASESORA_INICIALES, ENCONTRAR, NUMERO, RESPIRO_EN_LA_LLAMADA_MS, RESPIRO_ENTRE_FRASES_MS, elRodaje } from "./video-de-ventas/rodaje.mjs";
import { CACHE_DE_YOUTUBE, DESCRIPCION_DE_YOUTUBE, LA_LLAMADA_COMPLETA, NARRACION_DE_YOUTUBE, TITULO_DE_YOUTUBE } from "./video-de-youtube/narracion.mjs";

/** El vídeo que se publica, su miniatura y lo que el banco mide de él. */
export const ARCHIVOS_DE_YOUTUBE = Object.freeze({ video: "verzay-youtube.mp4", portada: "verzay-youtube.jpg", datos: "verzay-youtube.json" });

/**
 * Las capacidades que se rotulan, en el orden en que salen en ESTE corte. Son
 * las del vídeo de ventas —mismos títulos—, sin los reportes (aquí no salen).
 */
export const ESCENAS_DE_YOUTUBE = Object.freeze([
    "texto",
    "voz",
    "sheets",
    "medios",
    "caliente",
    "seguimiento",
    "llamada",
    "cita",
    "recordatorio",
    "asesor",
    "embudo",
    "multiagente",
]);

/**
 * Los separadores de día de la conversación: Laura escribe el lunes por la
 * noche, la IA la llama el martes y el recordatorio sale el miércoles. Cada
 * día nuevo es «Hoy» y el de antes pasa a «Ayer» (y el de antes, a su nombre).
 */
export const SEPARADORES_DE_YOUTUBE = Object.freeze({ M01: "Hoy", M11: "Hoy", M13: "Hoy" });

/** El respiro entre el embudo y la apertura a varias líneas (lo pide el guion). */
export const RESPIRO_ANTES_DE_LAS_LINEAS_MS = 2_000;

/** El celular en el centro, grande: la llamada se deja hablar sola. */
export const PLANO_DE_LA_LLAMADA = Object.freeze({ tel: { x: 761, y: 92, s: 0.95 } });

/** La transición de siempre entre planos (la de la hoja de estilos del estudio). */
const MOVER = Object.freeze({ ms: 1150, fundido: 700 });
/** Un corte: las pantallas saltan a su sitio y aparecen casi de golpe. */
const CORTE = Object.freeze({ ms: 0, fundido: 250 });

const CAPACIDADES_DE_YOUTUBE = ESCENAS_DE_YOUTUBE.map((escena) => {
    const c = CAPACIDADES.find((x) => x.escena === escena);
    if (!c) throw new Error(`[video] la capacidad «${escena}» no está en las del vídeo de ventas`);
    return c;
});

const {
    p,
    ctx,
    cal,
    voz,
    TONO,
    EN_LA_LLAMADA,
    mudo,
    est,
    enElCuadro,
    esperarEn,
    pulsarEn,
    clicEn,
    sonar,
    llega,
    presencia,
    reproducirNota,
    anillos,
    captura,
    esperarALaLista,
    alinearConLaLista,
    empezar,
    desdeElInicio,
    callar,
    decir,
    alDecir,
    acabar,
    capacidad,
    terminar,
} = await elRodaje({
    archivos: ARCHIVOS_DE_YOUTUBE,
    trabajo: "/tmp/video-de-youtube",
    narracion: NARRACION_DE_YOUTUBE,
    cacheDeLaNarracion: CACHE_DE_YOUTUBE,
    llamada: LA_LLAMADA_COMPLETA,
    cacheDeLaLlamada: CACHE_DE_YOUTUBE,
    calendario: (ahora) => elCalendario(ahora, { deNoche: true }),
    separadores: SEPARADORES_DE_YOUTUBE,
    capacidades: CAPACIDADES_DE_YOUTUBE,
});

/** Antes de grabar, los cinco chats ya están en pantalla con sus mensajes. */
const ANTES_DE_GRABAR_MS = 1_200;
/** Desde que empieza la grabación hasta que arranca la primera frase. */
const HASTA_LA_PRIMERA_FRASE_MS = 300;
/**
 * Cuándo llega el primer mensaje de Laura, contado desde que se alinea con la
 * lista del panel: con la palabra «escribiendo» de la segunda frase.
 */
const enLaFrase = (id, fragmento) => (voz[id].audio.ms * voz[id].texto.indexOf(fragmento)) / voz[id].texto.length;
const hastaElPrimerMensaje =
    ANTES_DE_GRABAR_MS + HASTA_LA_PRIMERA_FRASE_MS + voz.gancho.audio.ms + RESPIRO_ENTRE_FRASES_MS + enLaFrase("noche", "escribiendo") - 250;
await alinearConLaLista(hastaElPrimerMensaje);

/* ------------------------------------------------------------------ */
/* La grabación                                                        */
/* ------------------------------------------------------------------ */

// El fotograma 0 ya son los cinco chats, cada uno con su mensaje sin
// contestar: ni portada ni marca al principio.
await est("cortes.entrar");
await est("plano", PLANOS.montaje, CORTE);
await espera(p, ANTES_DE_GRABAR_MS);
const grabadora = await grabar(p, mudo, { ancho: 1920, alto: 1080 });
empezar(grabadora);

// 1. El gancho: cortes rápidos, uno por negocio, y la respuesta al instante.
await espera(p, HASTA_LA_PRIMERA_FRASE_MS);
await decir("gancho");
const PALABRAS_DEL_GANCHO = ["Tiendas", "clínicas", "cursos", "consultorías", "agencias de viajes"];
if (PALABRAS_DEL_GANCHO.length !== NEGOCIOS_DEL_ARRANQUE.length) throw new Error("[video] el gancho nombra otros negocios que las tarjetas");
for (const [i, palabra] of PALABRAS_DEL_GANCHO.entries()) {
    await alDecir(palabra, 120);
    await est("cortes.solo", i);
    if (i === 1) await captura("gancho-un-negocio");
}
await alDecir("y cualquier negocio", 150);
await est("cortes.todas");
const cincoContestadosMs = desdeElInicio();
await espera(p, 700);
await captura("gancho");

// 2. La noche: la clínica cerrada, y Laura escribe.
await callar(0);
await est("plano", PLANOS.tres, CORTE);
await est("cartel", laHora(cal.inicio), "En la clínica ya no hay nadie", "luna");
await decir("noche");
await espera(p, 600);
await captura("noche");
await alDecir("Pero Laura", 150);
await est("cartel", "");
await presencia("escribiendo");
await alDecir("escribiendo");
await presencia(null);
await esperarALaLista();
await llega("M01", { banner: true });
// Sin silencio entre la noche y la respuesta: la frase de la IA empieza en
// cuanto llega el mensaje, y el chat se abre mientras suena. Esperar a abrirlo
// en las tres pantallas para hablar dejaba seis segundos mudos.
await decir("texto");
await esperarEn("app", ENCONTRAR.filaDeLaura, CLIENTA.jid, { ms: 13_000, que: "la fila de Laura en el panel" });
// El negocio la abre en las tres pantallas, y su ficha en el panel.
const fila = await enElCuadro("app", ENCONTRAR.filaDeLaura, CLIENTA.jid);
await pulsarEn(fila, { ms: 450, antes: () => clicEn("app", `[data-chat-id="${CLIENTA.jid}"] button`, CLIENTA.nombreDeWhatsapp) });
await est("tel.abrir");
await est("web.abrir");
await alDecir("al instante", 300);
await llega("M02");
{
    const boton = await esperarEn("app", ENCONTRAR.botonDeLaFicha, null, { que: "el botón de la ficha" });
    if (!boton.abierta) await pulsarEn(await enElCuadro("app", ENCONTRAR.botonDeLaFicha), { ms: 350, antes: () => clicEn("app", 'button[title="Ver ficha del contacto"]') });
}
await captura("tres-pantallas");

// 3. Texto: la IA responde al instante y la ficha se llena sola.
await est("cursor.esconder");
await capacidad("texto");
await est("plano", PLANOS.telPanel, MOVER);
// Los campos de la cuenta viven en su sección de la ficha, plegada al abrir.
{
    const seccion = await esperarEn("app", ENCONTRAR.seccionDeLaFicha, SECCION_DE_LA_FICHA, { que: "la sección de la ficha" });
    if (!seccion.abierta) await pulsarEn(await enElCuadro("app", ENCONTRAR.seccionDeLaFicha, SECCION_DE_LA_FICHA), { ms: 400, antes: () => clicEn("app", "[data-ficha-de-contacto] button", SECCION_DE_LA_FICHA) });
}
await est("cursor.esconder");
await alDecir("su ficha", 100);
await esperarEn("app", ENCONTRAR.campoDeLaFicha, ["Servicio de interés", "Blanqueamiento"], { que: "el servicio en la ficha" });
await anillos([{ c: await enElCuadro("app", ENCONTRAR.campoDeLaFicha, ["Servicio de interés"]), texto: "Se llenó solo" }]);
await captura("texto");
await acabar(300);

// 4. Voz: Laura manda un audio; la IA lo escucha y le contesta con su voz.
await anillos([]);
await capacidad("voz");
await presencia("grabando");
await espera(p, 800);
await presencia(null);
await llega("M03");
await espera(p, 200);
const nota1 = await reproducirNota("M03", "clienta");
await espera(p, nota1 + 200);
await decir("voz");
await alDecir("lo escucha");
{
    const c = await esperarEn("app", ENCONTRAR.burbuja, ["SONRIE_M03", "financiación"], { ms: 4_000, que: "la nota transcrita en el panel" }).catch(() => null);
    if (c) await anillos([{ c: await enElCuadro("app", ENCONTRAR.burbuja, ["SONRIE_M03"]), texto: "Transcrita al instante" }]);
}
await alDecir("le contesta");
await llega("M04");
await acabar(200);
await anillos([]);
const nota2 = await reproducirNota("M04", "ia");
await espera(p, 1300);
{
    const financiacion = await esperarEn("app", ENCONTRAR.campoDeLaFicha, ["Financiación", "cuotas"], { ms: 6_000, que: "la financiación en la ficha" }).catch(() => null);
    const marcas = [];
    if (financiacion) marcas.push({ c: await enElCuadro("app", ENCONTRAR.campoDeLaFicha, ["Financiación"]), texto: "Financiación: hasta 6 cuotas", abajo: true });
    const n = await enElCuadro("app", ENCONTRAR.nombreEnLaFicha, CLIENTA.nombre);
    if (n) marcas.push({ c: n, texto: "Su nombre, de la nota de voz" });
    await anillos(marcas);
}
await espera(p, Math.max(0, nota2 - 1300) + 200);
await captura("voz");

// 5. Google Sheets: lo que cuenta Laura, también en la hoja de la clínica.
await anillos([]);
await capacidad("sheets");
await est("plano", PLANOS.sheets, MOVER);
await espera(p, 400);
await decir("sheets");
await alDecir("queda guardado", 200);
await est("hoja");
await espera(p, 900);
await anillos([
    {
        c: await p.evaluate(() => {
            const b = document.querySelector("#sheets tr.laura").getBoundingClientRect();
            return { x: b.x, y: b.y, w: b.width, h: b.height };
        }),
        texto: "Nombre, servicio y financiación",
        abajo: true,
    },
]);
await captura("sheets");
await acabar(500);

// 6. Archivos, y cliente caliente: PDF, video y la foto que ella manda.
await anillos([]);
await capacidad("medios");
await est("plano", PLANOS.telWeb, MOVER);
await espera(p, 400);
await decir("medios");
await alDecir("el PDF", 200);
await llega("M05");
await alDecir("el video", 200);
await llega("M06");
await est("web.reproducirVideo", "M06", 3_800);
await alDecir("entiende la foto", 400);
await llega("M07");
await captura("medios");
await alDecir("y como ya está interesada", 300);
await capacidad("caliente");
await est("plano", PLANOS.panel, MOVER);
await llega("M08");
await alDecir("cliente caliente", 300);
{
    await esperarEn("app", ENCONTRAR.textoEnLaFila, [CLIENTA.jid, "Caliente"], { ms: 6_000, que: "Caliente en la fila" }).catch(() => null);
    const marcas = [{ c: await enElCuadro("app", ENCONTRAR.filaDeLaura, CLIENTA.jid), texto: "Caliente · Interesado · Promo Instagram", abajo: true }];
    const origen = await enElCuadro("app", ENCONTRAR.campoDeLaFicha, ["Cómo nos conoció", "Instagram"]);
    if (origen) marcas.push({ c: origen, texto: "Origen: Instagram" });
    await anillos(marcas);
}
await captura("caliente");
await acabar(700);

// 7. Seguimiento: dos horas sin respuesta; la IA insiste, y por la tarde la llama.
await anillos([]);
await est("capacidad", 0, "");
await est("cartel", "2 horas después", "Laura no ha vuelto a escribir", "reloj");
await ctx.clock.setSystemTime(new Date(cal.seguimiento));
await est("plano", PLANOS.telWeb, { ms: 10, fundido: 10 });
await decir("seguimiento");
await alDecir("no la deja ir", 150);
await est("cartel", "");
await capacidad("seguimiento");
await alDecir("insiste con texto", 200);
await llega("M09");
await espera(p, 600);
await llega("M10");
await captura("seguimiento");
await alDecir("y si hace falta", 150);
await est("cartel", "Al día siguiente, por la tarde", "Laura sigue sin responder: la IA la llama", "reloj");
await acabar(500);

// 8. La llamada con IA, entera: suena, Laura contesta y se les deja hablar.
await ctx.clock.setSystemTime(new Date(cal.llamada));
await est("cartel", "");
await capacidad("llamada");
await est("plano", PLANO_DE_LA_LLAMADA, MOVER);
await est("llamada", "sonando");
sonar("tono", TONO, "tono de llamada");
await espera(p, TONO.ms + 200);
await est("llamada", "hablando");
const llamadaMs = desdeElInicio();
await espera(p, RESPIRO_EN_LA_LLAMADA_MS);
// La captura va MIENTRAS suena la frase y se descuenta de su espera: tomada
// después, el hueco entre esa frase y la siguiente pasaba de un segundo.
for (const [i, l] of EN_LA_LLAMADA.entries()) {
    const empezo = Date.now();
    await est("subtitulo", l.texto, l.quien);
    sonar("llamada", l.audio, l.texto);
    if (i === 2) await captura("llamada");
    await espera(p, Math.max(0, l.audio.ms + RESPIRO_EN_LA_LLAMADA_MS - (Date.now() - empezo)));
}
await est("subtitulo", "");
await est("llamada", null);
await est("plano", PLANOS.telPanel, MOVER);
await llega("M11");
await espera(p, 300);

// 9. La cita en el calendario; un día antes, el recordatorio; Laura confirma.
await capacidad("cita");
await llega("M12");
// La agenda se entera al volver a montarse (como al entrar a Agenda). Se hace
// con las esperas justas: al colgar, cada segundo sin voz pesa.
await clicEn("agenda", "button,a,[role=tab]", "Kanban");
await espera(p, 450);
await clicEn("agenda", "button,a,[role=tab]", "Dashboard");
await esperarEn("agenda", () => !!document.querySelector(".fc-semanaBtn-button"), null, { que: "la agenda otra vez" });
await clicEn("agenda", ".fc-semanaBtn-button");
await esperarEn("agenda", ENCONTRAR.eventoDeLaura, "Laura", { que: "la cita de Laura en la agenda" });
await decir("cita");
await est("plano", PLANOS.panel, MOVER);
await est("mostrarApp", "agenda");
await espera(p, 1150);
await anillos([{ c: await enElCuadro("agenda", ENCONTRAR.eventoDeLaura, "Laura"), texto: `${elDia(cal.cita)} · ${laHora(cal.cita)}` }]);
await captura("cita");
await alDecir("y un día antes", 150);
await anillos([]);
await est("capacidad", 0, "");
await est("cartel", "Un día antes", "El recordatorio sale solo", "calendario");
await ctx.clock.setSystemTime(new Date(cal.recordatorio));
await est("mostrarApp", "app");
await est("plano", PLANOS.telPanel, { ms: 10, fundido: 10 });
await alDecir("el recordatorio sale solo", 0);
await est("cartel", "");
await capacidad("recordatorio");
await llega("M13");
await alDecir("Laura confirma", 300);
await llega("M14");
await alDecir("lo sabes al instante", 200);
{
    const confirmada = await esperarEn("app", ENCONTRAR.textoEnLaFila, [CLIENTA.jid, "Cita confirmada"], { ms: 5_000, que: "la etapa en la fila" }).catch(() => null);
    const marcas = [];
    if (confirmada) marcas.push({ c: await enElCuadro("app", ENCONTRAR.filaDeLaura, CLIENTA.jid), texto: "Cita confirmada", abajo: true });
    marcas.push({ c: await enElCuadro("app", ENCONTRAR.burbuja, ["SONRIE_M14"]), texto: "Confirmó" });
    await anillos(marcas);
}
await acabar(900);
await captura("recordatorio");

// 10. Laura pide una persona: la IA la pasa con la asesora.
await anillos([]);
await capacidad("asesor");
await llega("M15");
await decir("asesor");
await alDecir("la pasa directo", 300);
await llega("M16");
{
    const asignada = await esperarEn("app", ENCONTRAR.textoEnLaFila, [CLIENTA.jid, ASESORA_INICIALES], { ms: 6_000, que: "la asesora en la fila" }).catch(() => null);
    const marcas = [{ c: await enElCuadro("app", ENCONTRAR.burbuja, ["SONRIE_M15"]), texto: "Pidió hablar con alguien" }];
    if (asignada) marcas.push({ c: await enElCuadro("app", ENCONTRAR.filaDeLaura, CLIENTA.jid), texto: `Asignada a ${ASESORA.nombre}`, abajo: true });
    await anillos(marcas);
}
await captura("asesor");
await acabar(500);

// 11. El embudo, un respiro, y la apertura a varias líneas: ahí sale la marca.
await anillos([]);
await clicEn("embudo", '[aria-label="Actualizar"]');
await esperarEn("embudo", ENCONTRAR.tarjetaDeLaura, [NUMERO, "Cita confirmada"], { que: "la tarjeta de Laura en Cita confirmada" });
await capacidad("embudo");
await est("plano", PLANOS.panel, MOVER);
await est("mostrarApp", "embudo");
await espera(p, 600);
await anillos([{ c: await enElCuadro("embudo", ENCONTRAR.tarjetaDeLaura, [NUMERO]), texto: "Laura, en Cita confirmada", abajo: true }]);
await decir("unDia");
await captura("embudo");
await acabar(0);
// El respiro: el embudo se queda quieto un par de segundos, sin voz.
await espera(p, RESPIRO_ANTES_DE_LAS_LINEAS_MS);
await anillos([]);
await capacidad("multiagente");
await est("plano", PLANOS.lineas, MOVER);
const lineasMs = desdeElInicio();
await est("lineas", { vivo: true });
await espera(p, 500);
await decir("crece");
await alDecir("varias líneas", 0);
await captura("lineas");
await alDecir("un solo panel", 250);
await est("capacidad", 0, "");
await est("juntarLineas");
await espera(p, 450);
await est("cierreConLema", false);
await est("plano", PLANOS.cierre, MOVER);
const marcaMs = desdeElInicio();
await acabar(0);
await espera(p, 300);
await captura("marca");

// 12. El llamado: la frase de la marca, y escríbenos o agenda.
await est("cierreConLema", true);
await espera(p, 500);
await decir("llamado");
await acabar(0);
await captura("cierre");
await espera(p, 1_500);

await terminar({
    // La miniatura: los cinco chats ya contestados.
    portadaMs: cincoContestadosMs + 900,
    extra: {
        titulo: TITULO_DE_YOUTUBE,
        descripcion: DESCRIPCION_DE_YOUTUBE,
        gancho: { negocios: NEGOCIOS_DEL_ARRANQUE.map((n) => n.id), cincoContestadosMs },
        llamada: { desdeMs: llamadaMs, lineas: EN_LA_LLAMADA.length },
        lineasMs,
        marcaMs,
        respiroAntesDeLasLineasMs: RESPIRO_ANTES_DE_LAS_LINEAS_MS,
    },
});
process.exit(0);
