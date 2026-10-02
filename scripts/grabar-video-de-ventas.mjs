#!/usr/bin/env node
/**
 * Graba el VÍDEO DE VENTAS: la historia de Clínica Sonríe contada en tres
 * pantallas a la vez —el celular del negocio, WhatsApp Web y el PANEL DE VERZAY
 * DE VERDAD—, con la voz Cedar de las guías y las notas de voz de la historia.
 *
 * Lo arranca `generar-video-de-ventas.sh`, que deja la App servida con
 * `next start` sobre una base de usar y tirar. Todo lo que no es el guion —los
 * archivos de la historia, la clínica sembrada, el estudio con las pestañas del
 * panel cargadas de verdad, que llegue un mensaje, la narración, la banda
 * sonora y el MP4— vive en `video-de-ventas/rodaje.mjs`, que comparte con el
 * corte de YouTube (`grabar-video-de-youtube.mjs`). Aquí va lo que es SUYO: el
 * guion, escena por escena.
 *
 * Con `ENSAYO=1` todo queda en el directorio de trabajo, con una captura por
 * escena, y `public/demo/` no se toca.
 *
 * Lo que es recreación y lo que no, dicho sin rodeos: el celular y WhatsApp Web
 * son dibujos fieles de lo que la historia dice; las respuestas de la IA son las
 * del guion (`historia.mjs`); el panel es la App de verdad leyendo la base.
 */
import { grabar } from "./grabadora-de-la-guia.mjs";
import { espera } from "./taller-de-la-guia.mjs";
import { PLANOS } from "./video-de-ventas/estudio.mjs";
import { ASESORA, CAPACIDADES, CIERRE_DEL_MONTAJE, CLIENTA, LA_LLAMADA, NEGOCIOS_DEL_ARRANQUE, SECCION_DE_LA_FICHA, elDia, laHora } from "./video-de-ventas/historia.mjs";
import { CACHE_DE_VENTAS, NARRACION } from "./video-de-ventas/narracion.mjs";
import { ASESORA_INICIALES, ENCONTRAR, NUMERO, RESPIRO_EN_LA_LLAMADA_MS, elRodaje } from "./video-de-ventas/rodaje.mjs";

/** El vídeo que se publica, su portada y lo que el banco mide de él. */
export const ARCHIVOS_DEL_VIDEO = Object.freeze({ video: "verzay-demo.mp4", portada: "verzay-demo.jpg", datos: "verzay-demo.json" });

const {
    p,
    ctx,
    cal,
    sembrado,
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
    archivos: ARCHIVOS_DEL_VIDEO,
    trabajo: "/tmp/video-de-ventas",
    narracion: NARRACION,
    cacheDeLaNarracion: CACHE_DE_VENTAS,
    llamada: LA_LLAMADA,
    cacheDeLaLlamada: CACHE_DE_VENTAS,
    capacidades: CAPACIDADES,
});

/**
 * Cuánto falta desde que empieza la grabación hasta que llega el primer
 * mensaje: las dos primeras frases, sus respiros y lo que se tarda en entrar
 * en la tercera (`ESPERA_DEL_PRIMER_MENSAJE_MS`).
 */
const ESPERA_DEL_PRIMER_MENSAJE_MS = 2_600;
/**
 * Cuánto se queda la PORTADA al empezar —el logo y el botón de reproducir—: es
 * el primer fotograma del vídeo, y de ahí sale la miniatura que enseña WhatsApp
 * al compartirlo (con el primer fotograma en negro, se veía un recuadro negro).
 */
const PORTADA_MS = 500;
/** La imagen de portada (la de la página y la de la vista previa al compartir) es un fotograma de la portada. */
const PORTADA_JPG_MS = 250;
const hastaElPrimerMensaje = PORTADA_MS + 150 + voz.gancho.audio.ms + voz.promesa.audio.ms + 900 + ESPERA_DEL_PRIMER_MENSAJE_MS;
// Se miden dos vueltas seguidas de la lista (sin grabar) y se arranca para
// que el primer mensaje caiga en la mitad de la ventana de una vuelta.
await alinearConLaLista(hastaElPrimerMensaje);

/* ------------------------------------------------------------------ */
/* La grabación                                                        */
/* ------------------------------------------------------------------ */

// La portada se pone ANTES de grabar: el fotograma 0 ya es ella.
await est("plano", PLANOS.portada);
await espera(p, 500);
const grabadora = await grabar(p, mudo, { ancho: 1920, alto: 1080 });
empezar(grabadora);

// 0. La portada: lo primero que se graba, y por eso la miniatura que enseña
// WhatsApp al compartir el archivo. Corta, para que la voz no empiece tarde.
await espera(p, PORTADA_MS);

// 1. El gancho: cinco negocios a la vez, y debajo, cualquier otro.
await est("plano", PLANOS.montaje);
await est("montaje");
await espera(p, 150);
await decir("gancho");
// El cierre del arranque sale con la frase que lo dice, y nunca antes del
// último mensaje de la última tarjeta (el estudio espera si hace falta).
await alDecir("y cualquier negocio");
const cierreDelMontajeMs = desdeElInicio() + (await est("yCualquierNegocio"));
await alDecir("responde al instante");
await captura("montaje");
// Dónde quedaron, en el cuadro, la portada del video de Cursos y el mapa del
// viaje, y cuándo: el banco mira ahí en los fotogramas del vídeo publicado
// que se ven como una imagen (no un recuadro negro con un punto).
const cajasDelMontajeMs = desdeElInicio();
const cajasDelMontaje = await p.evaluate(() =>
    Object.fromEntries(
        [
            ["video", '.mini[data-negocio="cursos"] .bur.vid .marco'],
            ["mapa", '.mini[data-negocio="viajes"] .bur.ubic img'],
        ].map(([clave, selector]) => {
            const r = document.querySelector(selector)?.getBoundingClientRect();
            return [clave, r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null];
        }),
    ),
);

// 2. La promesa: la marca ENTRA deslizándose en cuanto calla el gancho, sin
// respiro ni fundido largo, y al callar la promesa se pasa a las tres
// pantallas: ningún segundo con la pantalla quieta.
await callar(0);
const marcaMs = desdeElInicio();
await est("plano", PLANOS.marca);
await decir("promesa");
await espera(p, 700);
await captura("marca");

// 3. Tres pantallas y el primer mensaje.
await callar(0);
await est("plano", PLANOS.tres);
await espera(p, 900);
await decir("tresPantallas");
await espera(p, ESPERA_DEL_PRIMER_MENSAJE_MS - 900);
await esperarALaLista();
await llega("M01", { banner: true });
await esperarEn("app", ENCONTRAR.filaDeLaura, CLIENTA.jid, { ms: 13_000, que: "la fila de Laura en el panel" });
await espera(p, 700);
// El negocio la abre en las tres pantallas.
const fila = await enElCuadro("app", ENCONTRAR.filaDeLaura, CLIENTA.jid);
await pulsarEn(fila, { ms: 700, antes: () => clicEn("app", `[data-chat-id="${CLIENTA.jid}"] button`, CLIENTA.nombreDeWhatsapp) });
await est("tel.abrir");
await est("web.abrir");
// Y abre su ficha en el panel: es donde se va a ver lo que hace la IA.
await espera(p, 350);
{
    const boton = await esperarEn("app", ENCONTRAR.botonDeLaFicha, null, { que: "el botón de la ficha" });
    if (!boton.abierta) await pulsarEn(await enElCuadro("app", ENCONTRAR.botonDeLaFicha), { ms: 500, antes: () => clicEn("app", 'button[title="Ver ficha del contacto"]') });
}
await espera(p, 600);
await captura("tres-pantallas");

// 4. Texto: responde y llena la ficha.
await callar();
await est("cursor.esconder");
await capacidad("texto");
await est("plano", PLANOS.telPanel);
await decir("texto");
await espera(p, 1200);
// Los campos de la cuenta viven en su sección de la ficha, plegada al abrir.
{
    const seccion = await esperarEn("app", ENCONTRAR.seccionDeLaFicha, SECCION_DE_LA_FICHA, { que: "la sección de la ficha" });
    if (!seccion.abierta) await pulsarEn(await enElCuadro("app", ENCONTRAR.seccionDeLaFicha, SECCION_DE_LA_FICHA), { ms: 500, antes: () => clicEn("app", "[data-ficha-de-contacto] button", SECCION_DE_LA_FICHA) });
}
await alDecir("La IA le da");
await llega("M02");
await est("cursor.esconder");
await alDecir("su ficha", 100);
await esperarEn("app", ENCONTRAR.campoDeLaFicha, ["Servicio de interés", "Blanqueamiento"], { que: "el servicio en la ficha" });
await anillos([{ c: await enElCuadro("app", ENCONTRAR.campoDeLaFicha, ["Servicio de interés"]), texto: "Se llenó solo" }]);
await captura("texto");
await acabar(700);

// 5. Voz: la nota de la clienta y la respuesta con su propia voz.
await anillos([]);
await capacidad("voz");
await presencia("grabando");
await espera(p, 1300);
await presencia(null);
await llega("M03");
await espera(p, 250);
const nota1 = await reproducirNota("M03", "clienta");
await espera(p, nota1 + 250);
await decir("voz");
await alDecir("la entiende");
{
    const c = await esperarEn("app", ENCONTRAR.burbuja, ["SONRIE_M03", "financiación"], { ms: 4_000, que: "la nota transcrita en el panel" }).catch(() => null);
    if (c) await anillos([{ c: await enElCuadro("app", ENCONTRAR.burbuja, ["SONRIE_M03"]), texto: "Transcrita al instante" }]);
}
await alDecir("le contesta");
await llega("M04");
await acabar(200);
await anillos([]);
const nota2 = await reproducirNota("M04", "ia");
await espera(p, 1400);
{
    const nombre = await esperarEn("app", ENCONTRAR.campoDeLaFicha, ["Financiación", "cuotas"], { ms: 6_000, que: "la financiación en la ficha" }).catch(() => null);
    const marcas = [];
    if (nombre) marcas.push({ c: await enElCuadro("app", ENCONTRAR.campoDeLaFicha, ["Financiación"]), texto: "Financiación: hasta 6 cuotas", abajo: true });
    const n = await enElCuadro("app", ENCONTRAR.nombreEnLaFicha, CLIENTA.nombre);
    if (n) marcas.push({ c: n, texto: "Su nombre, de la nota de voz" });
    await anillos(marcas);
}
await espera(p, Math.max(0, nota2 - 1400) + 250);
await captura("voz");

// 5b. Google Sheets: los datos de Laura, también en la hoja de la clínica.
await anillos([]);
await capacidad("sheets");
await est("plano", PLANOS.sheets);
await espera(p, 500);
await decir("sheets");
await alDecir("quedan guardados", 200);
await est("hoja");
await espera(p, 1000);
await anillos([{ c: await p.evaluate(() => {
    const b = document.querySelector("#sheets tr.laura").getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
}), texto: "Nombre, servicio y financiación", abajo: true }]);
await captura("sheets");
await acabar(700);

// 6. Archivos: PDF, video e imagen.
await anillos([]);
await capacidad("medios");
await est("plano", PLANOS.telWeb);
await espera(p, 400);
await decir("medios");
await alDecir("la lista de precios", 500);
await llega("M05");
await alDecir("un video", 300);
await llega("M06");
await est("web.reproducirVideo", "M06", 4_200);
await alDecir("entiende la imagen", 700);
await llega("M07");
await captura("medios");
await acabar(900);

// 7. Caliente: calificación, etiquetas y etapa, solas.
await capacidad("caliente");
await est("plano", PLANOS.panel);
await llega("M08");
await decir("caliente");
await alDecir("calificada");
{
    await esperarEn("app", ENCONTRAR.textoEnLaFila, [CLIENTA.jid, "Caliente"], { ms: 6_000, que: "Caliente en la fila" }).catch(() => null);
    const marcas = [{ c: await enElCuadro("app", ENCONTRAR.filaDeLaura, CLIENTA.jid), texto: "Caliente · Interesado · Promo Instagram", abajo: true }];
    const origen = await enElCuadro("app", ENCONTRAR.campoDeLaFicha, ["Cómo nos conoció", "Instagram"]);
    if (origen) marcas.push({ c: origen, texto: "Origen: Instagram" });
    await anillos(marcas);
}
await captura("caliente");
await acabar(600);

// 8. Seguimiento: dos horas después, sin respuesta; la IA insiste.
await anillos([]);
await est("capacidad", 0, "");
await est("cartel", "2 horas después", "Laura no ha vuelto a escribir", "reloj");
await ctx.clock.setSystemTime(new Date(cal.seguimiento));
await est("plano", PLANOS.telWeb, { ms: 10 });
await decir("seguimiento");
await alDecir("la IA insiste", 150);
await est("cartel", "");
await capacidad("seguimiento");
await alDecir("con texto", 300);
await llega("M09");
await alDecir("un archivo", 300);
await llega("M10");
await captura("seguimiento");
await alDecir("hasta una llamada", 200);
await est("cartel", "Por la tarde", "Laura sigue sin responder: la IA la llama", "reloj");
await acabar(300);

// 8b. La llamada con IA: suena, Laura contesta y se les oye hablar.
await ctx.clock.setSystemTime(new Date(cal.llamada));
await est("cartel", "");
await capacidad("llamada");
await est("plano", PLANOS.telPanel);
await est("llamada", "sonando");
sonar("tono", TONO, "tono de llamada");
await espera(p, TONO.ms + 200);
await est("llamada", "hablando");
await espera(p, RESPIRO_EN_LA_LLAMADA_MS);
for (const l of EN_LA_LLAMADA) {
    await est("subtitulo", l.texto, l.quien);
    sonar("llamada", l.audio, l.texto);
    await espera(p, l.audio.ms + RESPIRO_EN_LA_LLAMADA_MS);
}
await captura("llamada");
await est("subtitulo", "");
await est("llamada", null);
await llega("M11");
await espera(p, 900);

// 9. La cita: lo que hablaron, agendado en el calendario.
await capacidad("cita");
await decir("cita");
await alDecir("y la cita", 300);
await llega("M12");
// La agenda se entera al volver a montarse (como al entrar a Agenda).
await clicEn("agenda", "button,a,[role=tab]", "Kanban");
await espera(p, 700);
await clicEn("agenda", "button,a,[role=tab]", "Dashboard");
await esperarEn("agenda", () => !!document.querySelector(".fc-semanaBtn-button"), null, { que: "la agenda otra vez" });
await clicEn("agenda", ".fc-semanaBtn-button");
await esperarEn("agenda", ENCONTRAR.eventoDeLaura, "Laura", { que: "la cita de Laura en la agenda" });
await alDecir("en tu calendario", 900);
await est("plano", PLANOS.panel);
await est("mostrarApp", "agenda");
await espera(p, 1250);
await anillos([{ c: await enElCuadro("agenda", ENCONTRAR.eventoDeLaura, "Laura"), texto: `${elDia(cal.cita)} · ${laHora(cal.cita)}` }]);
await captura("cita");
await acabar(1200);

// 10. El recordatorio: un día antes, y confirma.
await anillos([]);
await est("capacidad", 0, "");
await est("cartel", "Un día antes", "El recordatorio sale solo", "calendario");
await ctx.clock.setSystemTime(new Date(cal.recordatorio));
await est("mostrarApp", "app");
await est("plano", PLANOS.telPanel, { ms: 10 });
await espera(p, 1300);
await est("cartel", "");
await capacidad("recordatorio");
await decir("recordatorio");
await llega("M13");
await alDecir("Confirma", 500);
await llega("M14");
await espera(p, 1600);
{
    const confirmada = await esperarEn("app", ENCONTRAR.textoEnLaFila, [CLIENTA.jid, "Cita confirmada"], { ms: 5_000, que: "la etapa en la fila" }).catch(() => null);
    const marcas = [];
    if (confirmada) marcas.push({ c: await enElCuadro("app", ENCONTRAR.filaDeLaura, CLIENTA.jid), texto: "Cita confirmada", abajo: true });
    marcas.push({ c: await enElCuadro("app", ENCONTRAR.burbuja, ["SONRIE_M14"]), texto: "Confirmó" });
    await anillos(marcas);
}
await captura("recordatorio");
await acabar(500);

// 10b. Laura pide hablar con alguien: la conversación pasa a una asesora.
await anillos([]);
await capacidad("asesor");
await llega("M15");
await decir("asesor");
await alDecir("pasa directo", 300);
await llega("M16");
{
    const asignada = await esperarEn("app", ENCONTRAR.textoEnLaFila, [CLIENTA.jid, ASESORA_INICIALES], { ms: 6_000, que: "la asesora en la fila" }).catch(() => null);
    const marcas = [{ c: await enElCuadro("app", ENCONTRAR.burbuja, ["SONRIE_M15"]), texto: "Pidió hablar con alguien" }];
    if (asignada) marcas.push({ c: await enElCuadro("app", ENCONTRAR.filaDeLaura, CLIENTA.jid), texto: `Asignada a ${ASESORA.nombre}`, abajo: true });
    await anillos(marcas);
}
await captura("asesor");
await acabar(600);

// 11. El embudo: cada cliente en su etapa.
await anillos([]);
await clicEn("embudo", '[aria-label="Actualizar"]');
await esperarEn("embudo", ENCONTRAR.tarjetaDeLaura, [NUMERO, "Cita confirmada"], { que: "la tarjeta de Laura en Cita confirmada" });
await capacidad("embudo");
await est("plano", PLANOS.panel);
await est("mostrarApp", "embudo");
await decir("embudo");
await espera(p, 1300);
await anillos([{ c: await enElCuadro("embudo", ENCONTRAR.tarjetaDeLaura, [NUMERO]), texto: "Laura, en Cita confirmada", abajo: true }]);
await espera(p, 700);
await captura("embudo");
await alDecir("con toda su historia", 400);
await anillos([]);
await acabar(900);

// 11b. Los reportes: la semana, resumida sola.
await anillos([]);
await esperarEn("reportes", () => !!document.querySelector("div.cursor-pointer"), null, { que: "el reporte de la semana" });
await clicEn("reportes", "div.cursor-pointer");
await esperarEn("reportes", ENCONTRAR.porSelector, "[data-calidad-del-reporte]", { que: "la calidad en el reporte" });
await capacidad("reportes");
await est("mostrarApp", "reportes");
await decir("reportes");
await espera(p, 1400);
{
    const r = await enElCuadro("reportes", ENCONTRAR.porSelector, "[data-calidad-del-reporte]");
    if (r) await anillos([{ c: r, texto: "Calidad del equipo: 92/100" }]);
}
await captura("reportes");
await acabar(800);
await anillos([]);
await est("mostrarApp", "app");

// 11c. Multiagente: varias líneas y varios asesores, y el embudo de UNA asesora.
// El embudo filtrado se carga mientras se ven las líneas: cuando la voz dice
// «Cada asesor ve solo sus chats» ya está listo detrás.
await p.evaluate(([id, ruta]) => {
    document.getElementById(id).src = ruta;
}, ["embudo", `/embudos?asesor=${sembrado.asesor}`]);
await capacidad("multiagente");
await est("plano", PLANOS.lineas);
const lineasMs = desdeElInicio();
await est("lineas");
await decir("multiagente");
await espera(p, 1600);
{
    const r = await p.evaluate(() => {
        const b = document.querySelector('#lineas .asesor[data-asesor^="Andrea"]')?.getBoundingClientRect();
        return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    });
    await captura("lineas");
    await alDecir("Cada asesor ve solo sus chats", 700);
    if (r) await anillos([{ c: r, texto: `${ASESORA.nombre}, de Ventas`, abajo: true }]);
}
await esperarEn("embudo", ENCONTRAR.porSelector, '[data-filtro="asesor"]', { ms: 20_000, que: "el embudo filtrado" });
await esperarEn("embudo", ENCONTRAR.tarjetaDeLaura, [NUMERO, "Cita confirmada"], { ms: 20_000, que: "Laura en el embudo de la asesora" });
await alDecir("con su propio embudo", 500);
await anillos([]);
await est("plano", PLANOS.panel);
await est("mostrarApp", "embudo");
await espera(p, 700);
{
    const f = await enElCuadro("embudo", ENCONTRAR.porSelector, '[data-filtro="asesor"]');
    if (f) await anillos([{ c: f, texto: `Solo los clientes de ${ASESORA.nombre}`, abajo: true }]);
}
await captura("multiagente");
await acabar(900);
await anillos([]);
await est("mostrarApp", "app");

// 11d. El resumen: todo lo que se vio, en una pantalla.
await est("capacidad", 0, "");
await est("plano", PLANOS.resumen);
await espera(p, 300);
await est("resumen");
await decir("resumen");
await espera(p, 1700);
await captura("resumen");
await acabar(600);

// 12. El cierre.
await est("capacidad", 0, "");
await est("plano", PLANOS.cierre);
await espera(p, 400);
await decir("cierre");
await callar(0);
await espera(p, 900);
await est("subtitulo", "");
await captura("cierre");
await espera(p, 900);


await terminar({
    portadaMs: PORTADA_JPG_MS,
    extra: {
        // El arranque que se grabó, y cuándo sale su cierre: el banco busca
        // ahí el texto en los fotogramas del vídeo publicado.
        montaje: {
            tarjetas: NEGOCIOS_DEL_ARRANQUE.map((n) => n.tipo),
            medios: NEGOCIOS_DEL_ARRANQUE.map((n) => n.medio),
            cierre: CIERRE_DEL_MONTAJE,
            cierreMs: cierreDelMontajeMs,
            cajas: cajasDelMontaje,
            cajasMs: cajasDelMontajeMs,
        },
        // La portada del principio, cuándo entra la marca y cuándo salen
        // las líneas del equipo: el banco las busca en los fotogramas.
        portada: { hastaMs: PORTADA_MS, jpgMs: PORTADA_JPG_MS },
        marcaMs,
        lineasMs,
    },
});
process.exit(0);
