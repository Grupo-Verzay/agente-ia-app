/**
 * Las acciones de Correo para la pantalla, **apuntando lo que se les pide**.
 * Con `window.__sinBuzones` la persona no tiene ningún correo conectado.
 */
const w = globalThis as any;
const apuntar = (que: string, datos?: unknown) => (w.__correo ??= []).push({ que, datos });

const BUZON = { id: "bz1", proveedor: "gmail", direccion: "ana@gmail.com", nombre: null, estado: "conectada", ultimoError: null };
const CORREOS = [
    { id: "c1", de: "Cliente con un nombre bastante largo para recortar", deDireccion: "uno@cliente.com", asunto: "Cotización de 300 sillas para el evento de fin de año", fragmento: "Buen día, necesito…", fecha: new Date().toISOString(), sinLeer: true, conAdjuntos: true },
    { id: "c2", de: "Proveedor", deDireccion: "p@prov.com", asunto: "Factura", fragmento: "Adjunto la factura", fecha: "2026-09-01T10:00:00Z", sinLeer: false, conAdjuntos: false },
];

export async function misBuzonesAction() {
    apuntar("buzones");
    return { success: true, buzones: w.__sinBuzones ? [] : [BUZON], conBoton: { gmail: false, outlook: true } };
}
export async function bandejaAction(buzonId: unknown, cursor: unknown) {
    apuntar("bandeja", { buzonId, cursor });
    return { success: true, correos: CORREOS, siguiente: null };
}
export async function leerCorreoAction(buzonId: unknown, correoId: unknown) {
    apuntar("leer", { buzonId, correoId });
    return {
        success: true,
        correo: {
            id: correoId, de: "Cliente", deDireccion: "uno@cliente.com", para: "ana@gmail.com", cc: "", asunto: "Cotización",
            fecha: new Date().toISOString(), html: "<p>Hola <b>Ana</b></p><script>window.parent.__ejecutado = true</script>", texto: null,
            adjuntos: [{ id: "1", nombre: "precios-del-catalogo-2026-version-final.pdf", tipo: "application/pdf", tamano: 20480 }],
            idDeMensaje: "<x@y>", referencias: null, hilo: null, responderA: "uno@cliente.com",
        },
    };
}
export async function responderCorreoAction(buzonId: unknown, correoId: unknown, texto: unknown) {
    apuntar("responder", { buzonId, correoId, texto });
    return { success: true, enviado: true };
}
export async function conectarImapAction(raw: unknown) {
    apuntar("imap", raw);
    return { success: false, message: "El servidor de entrada no aceptó la conexión." };
}
export async function desconectarCorreoAction(buzonId: unknown) {
    apuntar("desconectar", { buzonId });
    return { success: true, quitado: true };
}
