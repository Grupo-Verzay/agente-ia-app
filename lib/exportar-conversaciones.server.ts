import "server-only";

import { db } from "@/lib/db";
import sharp from "sharp";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { seDejaIncrustar, type ImagenParaElPdf, type MarcaDelNegocio } from "@/lib/conversacion-en-pdf";
import { getPersistedMessages, resolveInstanceOwner } from "@/lib/chat-persistence";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import {
    aMensajeLegible,
    TOPE_DE_MENSAJES_POR_CONVERSACION,
    type MensajeLegible,
} from "@/lib/conversacion-legible";

/**
 * Leer UNA conversación entera de nuestra base, para exportarla o evaluarla.
 *
 * Va por `getPersistedMessages`, que es el lector de siempre: busca por las
 * TRES columnas de identidad (`remoteJid`, `remoteJidAlt`, `senderPn`) y
 * deduplica por el id de WhatsApp. Preguntar por una sola forma del contacto
 * «devuelve correcto y vacío», que es la regla de siempre de Chats.
 *
 * **No decide ningún acceso**: la lista de cuentas la pone quien llama, después
 * de haber comprobado que la línea se alcanza.
 */
const POR_PAGINA = 500;

export async function leerLaConversacion(params: {
    userIds: string[];
    instanceName: string;
    remoteJid: string;
    aliases?: string[];
    tope?: number;
}): Promise<{ mensajes: MensajeLegible[]; recortada: boolean }> {
    const tope = Math.max(1, Math.min(params.tope ?? TOPE_DE_MENSAJES_POR_CONVERSACION, TOPE_DE_MENSAJES_POR_CONVERSACION));
    const esGrupo = params.remoteJid.toLowerCase().endsWith("@g.us");
    const salida: MensajeLegible[] = [];
    let salta = 0;
    for (;;) {
        const pide = Math.min(POR_PAGINA, tope - salida.length + 1);
        const pagina = await getPersistedMessages({
            userIds: params.userIds,
            remoteJid: params.remoteJid,
            instanceName: params.instanceName,
            aliases: params.aliases ?? [],
            take: pide,
            skip: salta,
        });
        for (const ev of pagina) salida.push(aMensajeLegible(ev, { esGrupo }));
        salta += pagina.length;
        if (pagina.length < pide || salida.length > tope) break;
    }
    const recortada = salida.length > tope;
    return { mensajes: recortada ? salida.slice(0, tope) : salida, recortada };
}

/**
 * El nombre del contacto y de la línea, sacados de NUESTRA base y no del
 * navegador: el archivo lleva el nombre en la cabecera, y el que manda es el
 * mismo que pinta la bandeja (`customName` por encima de `pushName`).
 */
export async function losNombresDeLaConversacion(params: {
    duenoId: string;
    instanceName: string;
    instanceId: string | null;
    remoteJid: string;
    aliases?: string[];
}): Promise<{ contacto: string | null; linea: string; sessionId: number | null; asesorId: string | null }> {
    const candidatos = buildWhatsAppJidCandidates(params.remoteJid, params.aliases ?? []);
    const [sesion, instancia] = await Promise.all([
        db.session.findFirst({
            where: {
                userId: params.duenoId,
                ...(params.instanceId ? { instanceId: params.instanceId } : {}),
                OR: [{ remoteJid: { in: candidatos } }, { remoteJidAlt: { in: candidatos } }],
            },
            select: { id: true, customName: true, pushName: true, assignedAdvisorId: true },
            orderBy: { updatedAt: "desc" },
        }),
        db.instancia.findFirst({
            where: { instanceName: params.instanceName },
            select: { displayName: true },
        }),
    ]);
    return {
        contacto: sesion?.customName?.trim() || sesion?.pushName?.trim() || null,
        linea: instancia?.displayName?.trim() || params.instanceName,
        sessionId: sesion?.id ?? null,
        asesorId: sesion?.assignedAdvisorId ?? null,
    };
}

export { resolveInstanceOwner };

/* ------------------------------------------------------------------------ */
/* Lo que el PDF necesita de fuera: el logo y las imágenes                 */
/* ------------------------------------------------------------------------ */


/** Lo más que se baja de una imagen. Por encima no se incrusta: sale como tarjeta. */
const TOPE_DE_BYTES_DE_UNA_IMAGEN = 12 * 1024 * 1024;
const PLAZO_DE_UNA_IMAGEN_MS = 8_000;
/** Cuántas se bajan a la vez: una cola con N obreros, nunca lotes. */
const OBREROS = 4;
/** El lado más largo de una imagen dentro del PDF: más no se ve y pesa. */
const LADO_EN_EL_PDF = 900;

async function bajar(url: string): Promise<Buffer | null> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), PLAZO_DE_UNA_IMAGEN_MS);
    try {
        const r = await fetch(url, { signal: control.signal, redirect: "error" });
        if (!r.ok) return null;
        const declarado = Number(r.headers.get("content-length") ?? 0);
        if (declarado > TOPE_DE_BYTES_DE_UNA_IMAGEN) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        return buf.length > TOPE_DE_BYTES_DE_UNA_IMAGEN ? null : buf;
    } finally {
        clearTimeout(reloj);
    }
}

/**
 * Una imagen cualquiera (webp, png, heic que entienda sharp…) pasada a JPEG
 * reducido, que es lo que un PDF incrusta sin trabajo y lo que pesa poco. Un
 * sticker con fondo transparente queda sobre blanco.
 */
async function aJpegDelPdf(buf: Buffer): Promise<ImagenParaElPdf> {
    const bytes = await sharp(buf, { animated: false, limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: LADO_EN_EL_PDF, height: LADO_EN_EL_PDF, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
    return { bytes: new Uint8Array(bytes), formato: "jpg" };
}

/**
 * Baja las imágenes de NUESTRO almacenamiento que se van a incrustar. Nunca
 * lanza: una que no se pudo bajar o no se entiende no se incrusta, y el PDF la
 * pinta como tarjeta con su enlace. Pero no es mudo: se cuenta y se escribe.
 */
export async function lasImagenesDelPdf(urls: string[]): Promise<Map<string, ImagenParaElPdf>> {
    const salida = new Map<string, ImagenParaElPdf>();
    const publicUrl = process.env.S3_PUBLIC_URL;
    const cola = urls.filter((u) => seDejaIncrustar(u, publicUrl));
    let siguiente = 0;
    let fallidas = 0;
    const obrero = async () => {
        while (siguiente < cola.length) {
            const url = cola[siguiente++]!;
            try {
                const buf = await bajar(url);
                if (!buf) {
                    fallidas++;
                    continue;
                }
                salida.set(url, await aJpegDelPdf(buf));
            } catch {
                fallidas++;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(OBREROS, cola.length) }, obrero));
    if (fallidas) console.warn("[exportar] imágenes que no se pudieron incrustar en el PDF", { fallidas, de: cola.length });
    return salida;
}

/**
 * El nombre y el logo del negocio DUEÑO de la línea —no de quien exporta—:
 * el PDF es de la conversación, y la conversación es de esa cuenta.
 *
 * El nombre es el de la marca si la cuenta la puso, y si no `nombreDeLaCuenta`
 * (la empresa si de verdad se rellenó, luego el nombre, luego el correo). El
 * logo es el que la cuenta sube en Perfil (`User.image`), y solo se baja si
 * vive en nuestro almacenamiento: esa dirección la escribió la cuenta, y el
 * servidor no va a buscar lo que alguien le diga. Sin logo, el PDF pinta las
 * iniciales.
 */
export async function laMarcaDelNegocio(duenoId: string): Promise<MarcaDelNegocio> {
    const cuenta = await db.user.findUnique({
        where: { id: duenoId },
        select: { brandName: true, company: true, name: true, email: true, image: true },
    });
    const nombre = cuenta?.brandName?.trim() || (cuenta ? nombreDeLaCuenta(cuenta) : "") || "";
    let logo: ImagenParaElPdf | null = null;
    const url = cuenta?.image?.trim();
    try {
        let buf: Buffer | null = null;
        const dato = url?.match(/^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/i);
        if (dato) buf = Buffer.from(dato[1]!, "base64");
        else if (url && seDejaIncrustar(url, process.env.S3_PUBLIC_URL)) buf = await bajar(url);
        if (buf && buf.length <= TOPE_DE_BYTES_DE_UNA_IMAGEN) {
            const png = await sharp(buf, { animated: false })
                .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
                .png()
                .toBuffer();
            logo = { bytes: new Uint8Array(png), formato: "png" };
        }
    } catch (error) {
        console.warn("[exportar] el logo de la cuenta no se pudo usar en el PDF", { duenoId, error: String(error) });
    }
    return { nombre, logo };
}
