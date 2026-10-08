/**
 * La historia del vídeo de ventas de comercio electrónico: TIENDA NATIVA.
 *
 * Misma forma que la de la clínica (`../historia.mjs`) para que el estudio, la
 * semilla y la grabadora la lean igual. Lo que se comparte —el arranque de los
 * cinco negocios, la marca, el llamado, la zona y las ayudas de fechas— se
 * re-exporta de allí: tienen que ser idénticos en los dos vídeos.
 *
 * Novedades frente a la clínica, que el resto del montaje todavía NO entiende
 * (ver el PR): mensajes `de: "asesor"` (Andrea contesta en persona) y
 * `tipo: "ubicacion"` (Mateo manda su dirección).
 */
export {
    NEGOCIOS_DEL_ARRANQUE,
    CIERRE_DEL_MONTAJE,
    MEDIOS_DEL_MONTAJE,
    LEMA_DE_LA_MARCA,
    LLAMADO,
    ZONA,
    elDia,
    laHora,
    jidDe,
    lasIniciales,
    CALIFICACION,
} from "../historia.mjs";

/** El negocio de la historia. */
export const NEGOCIO = Object.freeze({
    nombre: "Tienda Nativa",
    tipo: "Tienda de calzado en línea",
    asistente: "Nía",
    linea: "NATIVA_PRINCIPAL",
    lineaVisible: "Tienda Nativa",
    lineaId: "inst-nativa-1",
    numero: "573105550199",
});

/** El cliente. El número es de mentira y no sale en pantalla entero. */
export const CLIENTA = Object.freeze({
    nombreDeWhatsapp: "Mateo",
    nombre: "Mateo Ríos",
    numero: "573014474471",
    jid: "573014474471@s.whatsapp.net",
});

/** La asesora de soporte que recibe a Mateo para el cambio. */
export const ASESORA = Object.freeze({ nombre: "Andrea", apellido: "Rojas", correo: "andrea@tienda-nativa.test", linea: "Soporte" });

/** El pedido de la historia. */
export const PEDIDO = Object.freeze({
    numero: "TN-1048",
    producto: "Urban Run",
    colores: ["negro", "blanco", "arena"],
    tallas: [38, 39, 40, 41, 42, 43, 44],
    precio: 289_900,
    extra: { nombre: "Medias Nativa", precio: 19_900 },
    total: 309_800,
    envioGratisDesde: 300_000,
    guia: "7712 0048 39",
    enlaceDePago: "https://pagos.ejemplo.co/TN-1048",
    direccion: { lugar: "Chapinero, Bogotá", detalle: "Torre 2, apto 502" },
});

/** Los archivos que viajan en la conversación. Los generará `tienda/medios.mjs` (PENDIENTE). */
export const MEDIOS = Object.freeze({
    anuncio: { archivo: "tienda-anuncio-urban-run.jpg", mime: "image/jpeg" },
    catalogo: { archivo: "tienda-catalogo-urban-run.jpg", mime: "image/jpeg" },
    videoDelProducto: { archivo: "tienda-urban-run.webm", mime: "video/webm", portada: "tienda-urban-run.jpg" },
    notaDelCliente: { archivo: "tienda-nota-cliente.ogg", mime: "audio/ogg; codecs=opus" },
    notaDelCambio: { archivo: "tienda-nota-cambio.ogg", mime: "audio/ogg; codecs=opus" },
    guiaDeTallas: { archivo: "guia-de-tallas.pdf", mime: "application/pdf", nombre: "Guia-de-tallas-Urban-Run.pdf", paginas: 1 },
    guiaDeEnvio: { archivo: "guia-de-envio.pdf", mime: "application/pdf", nombre: "Guia-envio-TN-1048.pdf", paginas: 1 },
    carrito: { archivo: "tienda-carrito.jpg", mime: "image/jpeg" },
    mapa: { archivo: "tienda-mapa-chapinero.jpg", mime: "image/jpeg" },
});

/** Las notas de voz: la de Mateo (talla) y la del cambio de las medias. */
export const NOTAS_DE_VOZ = Object.freeze({
    clienta: {
        voz: "ash",
        texto: "Hola, eh… yo normalmente calzo cuarenta y uno en tenis. ¿Esos tallan normal o grande?",
        transcripcion: "Hola, eh… yo normalmente calzo 41 en tenis. ¿Esos tallan normal o grande?",
    },
    cambio: {
        voz: "ash",
        texto: "Oye, los tenis me quedaron perfectos, pero las medias me quedaron pequeñas. ¿Las puedo cambiar por talla L?",
        transcripcion: "Oye, los tenis me quedaron perfectos, pero las medias me quedaron pequeñas. ¿Las puedo cambiar por talla L?",
    },
    ia: {
        voz: "marin",
        texto: "",
        transcripcion: "",
    },
});

/** Bogotá no cambia de hora: UTC−5 todo el año. */
const DESFASE_MS = -5 * 3_600_000;
const aLas = (dia, hh, mm = 0) => dia + (hh * 60 + mm) * 60_000;
function medianoche(ms) {
    const local = ms + DESFASE_MS;
    return local - (local % 86_400_000) - DESFASE_MS;
}

/**
 * El calendario: Mateo escribe de noche (23:04) desde un anuncio; el seguimiento
 * sale una hora después; el despacho al día siguiente, el aviso de entrega al
 * otro, y el cambio al tercero. Siempre en el futuro, como en la clínica.
 */
export function elCalendario(ahora = Date.now()) {
    const dia0 = medianoche(ahora) + 86_400_000;
    const dia1 = dia0 + 86_400_000;
    const dia2 = dia0 + 2 * 86_400_000;
    const dia3 = dia0 + 3 * 86_400_000;
    return {
        inicio: aLas(dia0, 23, 4),
        seguimiento: aLas(dia0, 23, 4) + 60 * 60_000,
        despacho: aLas(dia1, 10, 0),
        recordatorio: aLas(dia2, 9, 0),
        pregunta: aLas(dia2, 13, 20),
        cambio: aLas(dia3, 11, 0),
    };
}

const pesos = (n) => `$${n.toLocaleString("es-CO").replace(/,/g, ".")}`;

/** La conversación principal, en orden (M01–M26). Misma forma que la clínica. */
export function laConversacion(cal = elCalendario()) {
    const m = (clave, minutos) => cal[clave] + minutos * 60_000;
    return [
        { id: "M01", de: "cliente", tipo: "imagen", medio: "anuncio", texto: "Hola, ¿todavía tienen estos? 👟", en: m("inicio", 0),
          efectos: [{ etiqueta: "Instagram" }] },
        { id: "M02", de: "ia", tipo: "texto", en: m("inicio", 0),
          texto: "¡Hola! Soy Nía, de Tienda Nativa 👋 Sí, los Urban Run están disponibles en negro, blanco y arena, tallas 38 a 44. ¿Qué color y talla buscas?",
          efectos: [{ ficha: { producto: "Urban Run" } }, { etapa: "Consultando" }, { etiqueta: "Tenis" }] },
        { id: "M03", de: "ia", tipo: "imagen", medio: "catalogo", texto: "Así se ven los tres colores 👇", en: m("inicio", 1) },
        { id: "M04", de: "ia", tipo: "video", medio: "videoDelProducto", texto: "Y en movimiento 🎥", en: m("inicio", 1) },
        { id: "M05", de: "cliente", tipo: "nota", medio: "notaDelCliente", nota: "clienta", en: m("inicio", 2),
          efectos: [{ nombre: "Mateo Ríos" }] },
        { id: "M06", de: "ia", tipo: "texto", en: m("inicio", 2),
          texto: "Tallan normal, Mateo: con tu talla 41 ✅ quedas perfecto. Te dejo la guía de tallas por si acaso.",
          efectos: [{ ficha: { talla: "41" } }] },
        { id: "M07", de: "ia", tipo: "documento", medio: "guiaDeTallas", en: m("inicio", 2) },
        { id: "M08", de: "cliente", tipo: "texto", texto: "Perfecto, los quiero 🔥 en negro", en: m("inicio", 4),
          efectos: [{ ficha: { color: "Negro" } }, { calificacion: "Caliente" }] },
        { id: "M09", de: "ia", tipo: "texto", en: m("inicio", 4),
          texto: `Urban Run negro, talla 41: ${pesos(PEDIDO.precio)}. El envío es gratis desde ${pesos(PEDIDO.envioGratisDesde)}: si agregas unas Medias Nativa (${pesos(PEDIDO.extra.precio)}) te llega sin costo. ¿Te las agrego?`,
          efectos: [{ etapa: "En carrito" }] },
        { id: "M10", de: "cliente", tipo: "texto", texto: "Dale, agrégalas", en: m("inicio", 5),
          efectos: [{ ficha: { articulos: "Urban Run + Medias Nativa", total: pesos(PEDIDO.total) } }] },
        { id: "M11", de: "ia", tipo: "texto", en: m("inicio", 5),
          texto: `Listo 🙌 Total: ${pesos(PEDIDO.total)} con envío gratis. ¿Cómo prefieres pagar?\n1️⃣ Link de pago\n2️⃣ Contraentrega` },
        { id: "M12", de: "cliente", tipo: "texto", texto: "Link de pago. Ya lo hago", en: m("inicio", 6),
          efectos: [{ ficha: { metodoDePago: "Link de pago" } }, { etapa: "Pago pendiente" }] },
        { id: "M13", de: "ia", tipo: "texto", en: m("inicio", 6),
          texto: `Aquí tienes tu link 👉 ${PEDIDO.enlaceDePago}`,
          efectos: [{ ficha: { pedido: PEDIDO.numero } }, { seguimientoProgramado: true }] },
        { id: "M14", de: "ia", tipo: "imagen", medio: "carrito", seguimiento: true, en: m("seguimiento", 0),
          texto: "Mateo, tus Urban Run siguen apartados 👟 ¿Te ayudo a terminar el pago?" },
        { id: "M15", de: "cliente", tipo: "texto", texto: "Uy sí, ya pagué ✅", en: m("seguimiento", 3),
          efectos: [{ etiqueta: "Carrito recuperado" }] },
        { id: "M16", de: "ia", tipo: "texto", en: m("seguimiento", 3),
          texto: `¡Pago recibido! Tu pedido es el #${PEDIDO.numero} 🎉`,
          efectos: [{ etapa: "Pagado" }, { etiqueta: "Cliente nuevo" }] },
        { id: "M17", de: "ia", tipo: "texto", texto: "¿A dónde te lo enviamos? 📍", en: m("seguimiento", 3) },
        { id: "M18", de: "cliente", tipo: "ubicacion", medio: "mapa", ubicacion: PEDIDO.direccion,
          texto: PEDIDO.direccion.detalle, en: m("seguimiento", 5),
          efectos: [{ ficha: { ciudad: PEDIDO.direccion.lugar } }] },
        { id: "M19", de: "ia", tipo: "texto", en: m("seguimiento", 5),
          texto: "¡Anotado! Llega a Chapinero en 24 a 48 horas. Te aviso cuando salga." },
        { id: "M20", de: "ia", tipo: "documento", medio: "guiaDeEnvio", en: m("despacho", 0),
          texto: `Tu pedido ya salió 🚚 Guía ${PEDIDO.guia}`,
          efectos: [{ etapa: "Enviado" }, { ficha: { estadoDelEnvio: "En camino" } }] },
        { id: "M21", de: "ia", tipo: "texto", recordatorio: true, en: m("recordatorio", 0),
          texto: `📦 ¡Hoy llega tu pedido #${PEDIDO.numero}! Ten tu documento a la mano.` },
        { id: "M22", de: "cliente", tipo: "texto", texto: "¿Por dónde va? 😅", en: m("pregunta", 0) },
        { id: "M23", de: "ia", tipo: "texto", en: m("pregunta", 0),
          texto: "Va en reparto 🛵 Te llega antes de las 6 p. m.",
          efectos: [{ ficha: { estadoDelEnvio: "En reparto" } }] },
        { id: "M24", de: "cliente", tipo: "nota", medio: "notaDelCambio", nota: "cambio", en: m("cambio", 0),
          efectos: [{ etapa: "Entregado" }, { ficha: { estadoDelEnvio: "Entregado" } }] },
        { id: "M25", de: "ia", tipo: "texto", en: m("cambio", 0),
          texto: "¡Claro, Mateo! Te paso con Andrea, de soporte, para el cambio 🙌",
          efectos: [{ escalado: true }, { asesor: true }] },
        { id: "M26", de: "asesor", tipo: "texto", en: m("cambio", 4),
          texto: "Hola Mateo, soy Andrea. Mañana pasa el mensajero por ellas y te deja la talla L 👍" },
    ];
}

export const ETAPAS = Object.freeze([
    { nombre: "Nuevo", sistema: "nuevo" },
    { nombre: "Consultando", colorHex: "#3B82F6" },
    { nombre: "En carrito", colorHex: "#8B5CF6" },
    { nombre: "Pago pendiente", colorHex: "#F59E0B" },
    { nombre: "Pagado", colorHex: "#10B981" },
    { nombre: "Enviado", colorHex: "#06B6D4" },
    { nombre: "Entregado", sistema: "ganado" },
    { nombre: "Perdido", sistema: "perdido" },
]);

export const SECCION_DE_LA_FICHA = "Pedido";

export const CAMPOS_DE_LA_FICHA = Object.freeze([
    { key: "producto", label: "Producto", icon: "Tag" },
    { key: "color", label: "Color", icon: "Palette" },
    { key: "talla", label: "Talla", icon: "Ruler" },
    { key: "articulos", label: "Artículos", icon: "ShoppingCart" },
    { key: "total", label: "Total", icon: "DollarSign" },
    { key: "metodoDePago", label: "Método de pago", icon: "CreditCard" },
    { key: "ciudad", label: "Ciudad", icon: "MapPin" },
    { key: "pedido", label: "N.º de pedido", icon: "Hash" },
    { key: "estadoDelEnvio", label: "Estado del envío", icon: "Truck" },
]);

/** Los otros chats de la bandeja de la tienda (mismos en WhatsApp Web, panel y embudo). */
export const OTROS_CHATS = Object.freeze([
    { nombre: "Valeria Cruz", numero: "573112048801", etapa: "En carrito", hace: 18, ultimo: { de: "ia", texto: "Tu carrito sigue guardado 🛒 ¿Te ayudo a terminar?" } },
    { nombre: "Andrés Pinto", numero: "573202048802", etapa: "Pago pendiente", hace: 35, ultimo: { de: "ia", texto: "Te dejé el link de pago 👉 pagos.ejemplo.co/TN-1046" } },
    { nombre: "Camila Duarte", numero: "573152048803", etapa: "Consultando", hace: 52, ultimo: { de: "cliente", texto: "¿Tienen el Urban Run en blanco talla 38?" } },
    { nombre: "Juliana Mora", numero: "573002048804", etapa: "Enviado", hace: 90, ultimo: { de: "ia", texto: "Tu pedido #TN-1041 ya va en camino 🚚" } },
    { nombre: "Felipe Rincón", numero: "573172048805", etapa: "Entregado", hace: 140, ultimo: { de: "cliente", texto: "¡Llegaron perfectos, gracias! 🙌" } },
    { nombre: "Natalia Vélez", numero: "573182048806", etapa: "Perdido", hace: 300, ultimo: { de: "cliente", texto: "Gracias, por ahora no." } },
]);

export const ETIQUETAS = Object.freeze([
    { nombre: "Instagram", color: "#E1306C" },
    { nombre: "Tenis", color: "#3B82F6" },
    { nombre: "Carrito recuperado", color: "#10B981" },
    { nombre: "Cliente nuevo", color: "#8B5CF6" },
]);

/** Las píldoras del resumen, en el orden del vídeo. */
export const CAPACIDADES = Object.freeze([
    "Catálogo con fotos y video",
    "Notas de voz",
    "Inventario en Google Sheets",
    "Carrito y venta cruzada",
    "Link de pago",
    "Carritos recuperados",
    "Envío y guía",
    "Avisos de entrega",
    "Paso a un asesor",
    "Embudo de pedidos",
    "Reportes",
]);

/** Las cifras del reporte de la tienda. */
export const LOS_REPORTES = Object.freeze({ ticketPromedio: 214_500, carritosRecuperados: 7, primeraRespuestaS: 4, atendidoPorIaPct: 92 });

/** La hoja de Google Sheets: inventario y pedidos. La fila de Mateo la escribe el vídeo. */
export const LA_HOJA = Object.freeze({
    titulo: "Tienda Nativa · Operación",
    pestanas: ["Inventario", "Pedidos"],
    inventario: {
        columnas: ["Producto", "Color", "Talla", "Stock"],
        filas: [
            ["Urban Run", "Negro", "41", "12"],
            ["Urban Run", "Blanco", "41", "5"],
            ["Urban Run", "Arena", "41", "3"],
            ["Medias Nativa", "—", "M/L", "40"],
        ],
    },
    columnas: ["Fecha", "Pedido", "Cliente", "Artículos", "Total", "Estado"],
    filas: [
        ["Ayer", "TN-1041", "Juliana Mora", "Urban Run blanco 38", "$289.900", "Enviado"],
        ["Ayer", "TN-1046", "Andrés Pinto", "Urban Run arena 42", "$289.900", "Pago pendiente"],
    ],
    mateo: ["Hoy", "TN-1048", "Mateo Ríos", "Urban Run negro 41 + Medias", "$309.800", "Pagado"],
});

/** Las líneas del equipo de la tienda. */
export const LINEAS_DEL_EQUIPO = Object.freeze([
    { nombre: "Ventas", asesores: 4 },
    { nombre: "Soporte", asesores: 2 },
    { nombre: "Despachos", asesores: 2 },
]);
