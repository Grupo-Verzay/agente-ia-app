/**
 * Una conversación de muestra con TODOS los tipos que exporta el texto plano,
 * la misma para el banco en Node y el de Chromium.
 */
import sharp from "sharp";

export const BASE = 1790000000; // 2026-09-21 en segundos
export const S3 = "https://s3.banco.test";
export const IMAGEN_NUESTRA = `${S3}/bucket/cuenta/chat/foto.jpg`;
export const IMAGEN_AJENA = "https://mmg.whatsapp.net/v/t62/ajena.enc";
export const VIDEO = `${S3}/bucket/cuenta/chat/video.mp4`;
export const AUDIO = `${S3}/bucket/cuenta/chat/nota.ogg`;
export const DOCUMENTO = `${S3}/bucket/cuenta/chat/cotizacion.pdf`;

const m = (min, quien, tipo, extra = {}) => ({
    ts: BASE + min * 60,
    quien,
    tipo,
    texto: "",
    ...extra,
});

export const MENSAJES = [
    m(0, "contacto", "conversation", { texto: "Hola, ¿tienen envíos a Cali? 😀" }),
    m(1, "ia", "conversation", { texto: "¡Hola Juan! Sí, enviamos a todo el país." }),
    m(2, "asesor", "conversation", { texto: "Soy Ana, del equipo de ventas. Te paso el catálogo." }),
    m(3, "contacto", "imageMessage", { texto: "Así la quiero", mediaUrl: IMAGEN_NUESTRA }),
    m(4, "contacto", "imageMessage", { mediaUrl: IMAGEN_AJENA }),
    m(5, "asesor", "videoMessage", { texto: "Mira cómo se arma", mediaUrl: VIDEO }),
    m(6, "contacto", "audioMessage", { mediaUrl: AUDIO, segundos: 23, transcripcion: "quiero dos unidades para el viernes" }),
    m(7, "asesor", "documentMessage", { mediaUrl: DOCUMENTO, nombreDelArchivo: "cotizacion-2026.pdf" }),
    m(8, "contacto", "locationMessage", {}),
    m(9, "contacto", "contactMessage", {}),
    m(10, "contacto", "stickerMessage", {}),
    m(11, "asesor", "call", {}),
    m(12, "contacto", "conversation", { eliminado: true, texto: "algo que se borró" }),
    m(13, "asesor", "conversation", { notaInterna: true, texto: "NOTA INTERNA SECRETA" }),
    m(24 * 60 + 5, "contacto", "conversation", {
        texto: "Mensaje del día siguiente con una palabra larguísima: https://ejemplo.com/una/ruta/muy/larga/que/no/cabe/en/una/sola/linea/de/la/burbuja/para/nada",
    }),
    m(24 * 60 + 6, "ia", "conversation", { texto: Array.from({ length: 140 }, (_, i) => `Línea ${i + 1} de un mensaje enorme.`).join("\n") }),
];

export const CONVERSACION = {
    contacto: "Juan Pérez",
    numero: "+573001112233",
    linea: "Línea de Ventas",
    mensajes: MENSAJES,
};

export async function imagenDePrueba() {
    const bytes = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#ff3366" } }).jpeg().toBuffer();
    return { bytes: new Uint8Array(bytes), formato: "jpg" };
}
export async function logoDePrueba() {
    const bytes = await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 20, g: 90, b: 200, alpha: 1 } } }).png().toBuffer();
    return { bytes: new Uint8Array(bytes), formato: "png" };
}
