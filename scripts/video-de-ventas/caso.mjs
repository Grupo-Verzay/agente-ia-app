/**
 * Qué vídeo de ventas se graba: la clínica (de siempre) o la tienda en línea.
 * Lo elige la variable `CASO` (`clinica` por defecto, o `tienda`), y todo el
 * camino —backend, estudio, semilla, medios y grabador— lee de aquí. Así el
 * mismo estudio y el mismo panel cuentan dos historias sin copiarse.
 *
 * Lo que un caso no tiene sale `undefined` (la tienda no tiene llamada; la
 * clínica no tiene pedido): quien lo use lo mira antes.
 */
export const CASO = process.env.CASO === "tienda" ? "tienda" : "clinica";
const enLaTienda = CASO === "tienda";

const h = await import(enLaTienda ? "./tienda/historia.mjs" : "./historia.mjs");
const n = await import(enLaTienda ? "./tienda/narracion.mjs" : "./narracion.mjs");
const m = await import(enLaTienda ? "./tienda/medios.mjs" : "./medios.mjs");

export const {
    ASESORA, CALIFICACION, CAMPOS_DE_LA_FICHA, CAPACIDADES, CIERRE_DEL_MONTAJE, CLIENTA, ETAPAS,
    ETIQUETAS, LA_HOJA, LA_LLAMADA, LEMA_DE_LA_MARCA, LINEAS_DEL_EQUIPO, LLAMADO, LOS_REPORTES, MEDIOS,
    MEDIOS_DEL_MONTAJE, NEGOCIO, NEGOCIOS_DEL_ARRANQUE, NOTAS_DE_VOZ, OTROS_CHATS, PEDIDO,
    SECCION_DE_LA_FICHA, ZONA, elCalendario, elDia, jidDe, laConversacion, laHora, lasIniciales,
} = h;

export const { CACHE_DE_VENTAS, NARRACION, VOZ_DE_VENTAS, loQueSeSintetiza } = n;
/** La voz de quien escribe al negocio: Laura en la clínica, Mateo en la tienda. */
export const VOZ_DEL_CLIENTE = enLaTienda ? n.VOZ_DE_MATEO : n.VOZ_DE_LA_CLIENTA;
/** La voz de la IA en sus notas de voz (la tienda no manda ninguna). */
export const VOZ_DE_LA_IA = n.VOZ_DE_SOFIA;
export const LA_VOZ_EN_LA_LLAMADA = n.LA_VOZ_EN_LA_LLAMADA;

export const { generarLosMedios } = m;

/** Los archivos publicados de cada vídeo. */
export const ARCHIVOS_DEL_VIDEO = Object.freeze(
    enLaTienda
        ? { video: "verzay-demo-tienda.mp4", portada: "verzay-demo-tienda.jpg", datos: "verzay-demo-tienda.json" }
        : { video: "verzay-demo.mp4", portada: "verzay-demo.jpg", datos: "verzay-demo.json" },
);
