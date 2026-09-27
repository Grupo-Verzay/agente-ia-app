/**
 * Las acciones de Correo para la pantalla, **apuntando lo que se les pide**.
 * Con `window.__sinBuzones` la persona no tiene ningún correo conectado; con
 * `window.__sinPermiso` el buzón es de los permisos viejos (abre, no marca ni
 * elimina); con `window.__falla` eliminar rebota.
 *
 * Con `window.__varios` la persona tiene DOS buzones —el de Gmail y uno de
 * dominio propio— y los dos tienen un correo con id «c1» (en IMAP un id es un
 * número pequeño y se repite entre buzones: la pantalla tiene que distinguirlos
 * por su buzón). El de dominio propio trae además una página siguiente, y
 * `window.__falloDe` hace que un buzón no conteste en la bandeja unificada.
 */
const w = globalThis as any;
const apuntar = (que: string, datos?: unknown) => (w.__correo ??= []).push({ que, datos });

const BUZON = { id: "bz1", proveedor: "gmail", direccion: "ana@gmail.com", nombre: null, estado: "conectada", ultimoError: null, firma: null, firmaActiva: false };
const BUZON2 = { id: "bz2", proveedor: "imap", direccion: "ventas@verzay.com", nombre: null, estado: "conectada", ultimoError: null, firma: "Ventas Verzay", firmaActiva: true };
const CORREOS = [
    { id: "c1", de: "Cliente con un nombre bastante largo para recortar", deDireccion: "uno@cliente.com", asunto: "Cotización de 300 sillas para el evento de fin de año", fragmento: "Buen día, necesito…", fecha: new Date().toISOString(), sinLeer: true, conAdjuntos: true },
    { id: "c2", de: "Proveedor", deDireccion: "p@prov.com", asunto: "Factura", fragmento: "Adjunto la factura", fecha: "2026-09-01T10:00:00Z", sinLeer: false, conAdjuntos: false, destacado: true },
];

/**
 * Un anclado VIEJO: de hace meses, fuera de lo cargado. Con `window.__anclado`
 * la persona lo tiene anclado en bz1: tiene que salir ARRIBA de todo aunque no
 * esté en la página, que es para lo que se ancla.
 */
const ANCLADO_VIEJO = { buzonId: "bz1", id: "viejo-1", de: "Contrato", deDireccion: "legal@firma.com", asunto: "Contrato firmado", fragmento: "Adjunto el contrato", fecha: "2026-03-01T10:00:00Z", conAdjuntos: true, ancladoEn: 1 };

const MAS_DE_BZ1 = { id: "c3", de: "Antiguo", deDireccion: "a@viejo.com", asunto: "Muy viejo", fragmento: "", fecha: "2026-08-10T10:00:00Z", sinLeer: false, conAdjuntos: false };
const DE_BZ2 = [
    { id: "c1", de: "Distribuidor", deDireccion: "d@dist.com", asunto: "Pedido semanal", fragmento: "Confirmo el pedido", fecha: "2026-09-10T10:00:00Z", sinLeer: false, conAdjuntos: false },
    { id: "v2", de: "Banco", deDireccion: "b@banco.com", asunto: "Extracto", fragmento: "Su extracto", fecha: "2026-08-20T10:00:00Z", sinLeer: true, conAdjuntos: false },
];
const PAGINA2_DE_BZ2 = [
    { id: "v3", de: "Transportadora", deDireccion: "t@trans.com", asunto: "Guía", fragmento: "", fecha: "2026-08-15T10:00:00Z", sinLeer: false, conAdjuntos: false },
];

export async function misBuzonesAction() {
    apuntar("buzones");
    return {
        success: true,
        buzones: w.__sinBuzones ? [] : w.__varios ? [BUZON, BUZON2] : [BUZON],
        conBoton: { gmail: false, outlook: true },
        anclados: w.__anclado ? [ANCLADO_VIEJO] : [],
    };
}
/**
 * El total de cada bandeja según el proveedor. Con `window.__totalFalla` el de
 * dominio propio no contesta: esa fila y «Todas» van sin número.
 */
export async function totalesDeLosBuzonesAction() {
    apuntar("totales");
    return {
        success: true,
        totales: [
            { buzonId: "bz1", total: 1234 },
            { buzonId: "bz2", total: w.__totalFalla ? null : 87 },
        ],
    };
}
export async function bandejaUnificadaAction(cursores?: Record<string, string>) {
    apuntar("unificada", { cursores: cursores ?? null });
    const conBuzon = (id: string, lista: any[]) => lista.map((c) => ({ ...c, buzonId: id }));
    const todos = [
        { id: "bz1", correos: [...CORREOS, MAS_DE_BZ1], siguiente: null as string | null },
        { id: "bz2", correos: DE_BZ2, siguiente: "p2" as string | null },
    ];
    const pedidos = cursores ? todos.filter((b) => cursores[b.id]) : todos;
    return {
        success: true,
        porBuzon: pedidos.map((b) => {
            if (w.__falloDe === b.id) return { buzonId: b.id, ok: false, message: "Vuelve a conectar este correo.", reconectar: true };
            if (cursores?.[b.id] === "p2") return { buzonId: b.id, ok: true, correos: conBuzon(b.id, PAGINA2_DE_BZ2), siguiente: null };
            return { buzonId: b.id, ok: true, correos: conBuzon(b.id, b.correos), siguiente: b.siguiente };
        }),
    };
}
export async function bandejaAction(buzonId: unknown, cursor: unknown) {
    apuntar("bandeja", { buzonId, cursor });
    return { success: true, correos: buzonId === "bz2" ? DE_BZ2 : CORREOS, siguiente: null };
}
export async function leerCorreoAction(buzonId: unknown, correoId: unknown, estabaSinLeer?: unknown) {
    apuntar("leer", { buzonId, correoId, estabaSinLeer });
    // Un poco de espera: la marca de la fila tiene que verse ANTES de la respuesta.
    await new Promise((r) => setTimeout(r, 150));
    const sinPermiso = Boolean(w.__sinPermiso) && estabaSinLeer !== false;
    return {
        success: true,
        leido: !sinPermiso,
        motivoSinMarcar: sinPermiso ? "Este correo se conectó cuando la plataforma solo pedía permiso para leer. Vuelve a conectarlo para poder marcar como leído y eliminar correos." : null,
        reconectar: sinPermiso,
        correo: {
            id: correoId, de: "Cliente", deDireccion: "uno@cliente.com", para: "ana@gmail.com", cc: "", asunto: "Cotización",
            fecha: new Date().toISOString(), html: "<p>Hola <b>Ana</b></p><script>window.parent.__ejecutado = true</script>", texto: null,
            adjuntos: [{ id: "1", nombre: "precios-del-catalogo-2026-version-final.pdf", tipo: "application/pdf", tamano: 20480 }],
            idDeMensaje: "<x@y>", referencias: null, hilo: null, responderA: "uno@cliente.com",
        },
    };
}
export async function responderCorreoAction(buzonId: unknown, correoId: unknown, texto: unknown, adjuntos?: any[]) {
    apuntar("responder", { buzonId, correoId, texto, adjuntos: (adjuntos ?? []).map((a) => a.nombre) });
    return { success: true, enviado: true };
}
export async function reenviarCorreoAction(buzonId: unknown, correoId: unknown, para: unknown, texto: unknown, adjuntos?: any[]) {
    apuntar("reenviar", { buzonId, correoId, para, texto, adjuntos: (adjuntos ?? []).map((a) => a.nombre) });
    return { success: true, enviado: true, para: String(para).split(/[\s,]+/) };
}
export async function marcarNoLeidoAction(buzonId: unknown, correoId: unknown) {
    apuntar("noLeido", { buzonId, correoId });
    await new Promise((r) => setTimeout(r, 100));
    if (w.__falla) return { success: false, message: "Google no contestó." };
    return { success: true, sinLeer: true };
}
export async function destacarCorreoAction(buzonId: unknown, correoId: unknown, destacado: unknown) {
    apuntar("destacar", { buzonId, correoId, destacado });
    await new Promise((r) => setTimeout(r, 100));
    if (w.__falla) return { success: false, message: "Google no contestó." };
    return { success: true, destacado };
}
export async function archivarCorreoAction(buzonId: unknown, correoId: unknown) {
    apuntar("archivar", { buzonId, correoId });
    await new Promise((r) => setTimeout(r, 100));
    if (w.__falla) return { success: false, message: "Google no contestó." };
    return { success: true, carpeta: "Todos los mensajes" };
}
export async function anclarCorreoAction(buzonId: unknown, correoId: unknown) {
    apuntar("anclar", { buzonId, correoId });
    const de = [...CORREOS, ...DE_BZ2].find((c) => c.id === correoId)!;
    return { success: true, anclado: { ...de, buzonId, ancladoEn: Date.now() } };
}
export async function desanclarCorreoAction(buzonId: unknown, correoId: unknown) {
    apuntar("desanclar", { buzonId, correoId });
    return { success: true, desanclado: true };
}
export async function guardarFirmaAction(buzonId: unknown, firma: unknown, activa: unknown) {
    apuntar("firma", { buzonId, firma, activa });
    const f = typeof firma === "string" && firma.trim() ? firma.trim() : null;
    return { success: true, firma: f, firmaActiva: activa === true && Boolean(f) };
}
export async function sugerirRespuestaDeCorreoAction(buzonId: unknown, correoId: unknown, borrador?: unknown) {
    apuntar("sugerir", { buzonId, correoId, borrador });
    await new Promise((r) => setTimeout(r, 100));
    if (w.__sinIa) return { success: false, message: "La cuenta no tiene una IA configurada." };
    return { success: true, sugerencia: "Hola, gracias por escribir. Te envío la cotización hoy mismo.\nSaludos." };
}
export async function eliminarCorreoAction(buzonId: unknown, correoId: unknown) {
    apuntar("eliminar", { buzonId, correoId });
    await new Promise((r) => setTimeout(r, 150));
    if (w.__falla) return { success: false, message: "Google no contestó." };
    if (w.__sinPermiso) return { success: false, message: "Vuelve a conectarlo para poder marcar como leído y eliminar correos.", reconectar: true };
    return { success: true, eliminado: true, aLaPapelera: true };
}
export async function conectarImapAction(raw: unknown) {
    apuntar("imap", raw);
    return { success: false, message: "El servidor de entrada no aceptó la conexión." };
}
export async function desconectarCorreoAction(buzonId: unknown) {
    apuntar("desconectar", { buzonId });
    return { success: true, quitado: true };
}
