import "server-only";

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { minioClient } from "@/lib/minio";
import { laMarcaDelNegocio } from "@/lib/exportar-conversaciones.server";
import { laZonaHorariaDeLaCuenta } from "@/lib/zona-de-la-cuenta.server";
import { leerAjustesDeCotizacion } from "@/lib/cotizacion-ia-db";
import {
    comoPedidos,
    decidirLaCotizacion,
    elNumeroDeLaCotizacion,
    elPrecio,
    losDatosDelNegocio,
    type DecisionDeCotizacion,
} from "@/lib/cotizacion-ia";
import { cotizacionEnPdf, elNombreDelPdf } from "@/lib/cotizacion-en-pdf";

/**
 * Lo que hace la ruta `/api/cotizacion-ia` cuando el agente pide una
 * cotización: decide (`decidirLaCotizacion`, pura) y, si está lista, arma el
 * PDF, lo sube al bucket y la deja apuntada en el módulo de Cotizaciones de la
 * App, con estado `enviada`.
 *
 * **No la manda**: eso lo hace el backend por la línea de la conversación
 * (`enviarMediaIaPorLinea`), que es el único camino que sabe mandar un archivo
 * por Evolution, Waha o un canal y dejar su burbuja en Chats. Aquí se prepara;
 * allí se entrega.
 */

export type PeticionDeCotizacion = {
    cuentaId: string;
    remoteJid: string;
    nombreCliente?: string | null;
    items: unknown;
    pideCondicionesEspeciales?: boolean;
    detalleCondiciones?: string | null;
};

export type RespuestaDeCotizacion =
    | Exclude<DecisionDeCotizacion, { estado: "lista" }>
    | {
          estado: "lista";
          cotizacionId: string;
          numero: string;
          url: string;
          nombreDelArchivo: string;
          total: number;
          totalLegible: string;
          resumen: string;
      }
    | { estado: "error"; motivo: string };

/** El número que se enseña del cliente: solo si el jid ES un teléfono. Un `@lid` no lo es. */
export function elTelefonoDelJid(remoteJid: string): string | null {
    const [numero, dominio] = (remoteJid ?? "").split("@");
    if (!dominio || !/^(s\.whatsapp\.net|c\.us)$/.test(dominio)) return null;
    const digitos = (numero ?? "").split(":")[0]!.replace(/\D/g, "");
    return digitos.length >= 7 ? digitos : null;
}

async function elNombreDelCliente(cuentaId: string, remoteJid: string, pedido?: string | null): Promise<string> {
    const dado = (pedido ?? "").trim();
    if (dado) return dado.slice(0, 120);
    try {
        const sesion = await db.session.findFirst({
            where: { userId: cuentaId, OR: [{ remoteJid }, { remoteJidAlt: remoteJid }] },
            select: { customName: true, pushName: true },
        });
        const nombre = (sesion?.customName || sesion?.pushName || "").trim();
        if (nombre) return nombre.slice(0, 120);
    } catch (error) {
        console.warn("[cotizacion-ia] no se pudo leer el nombre del contacto", { cuentaId, error: String(error) });
    }
    return "Cliente";
}

/** Perfil del entrenamiento de WhatsApp (el canal BASE). */
async function elPerfilDelNegocio(cuentaId: string): Promise<{ nombre: string; datos: string[] }> {
    try {
        const prompt = await db.agentPrompt.findFirst({
            where: { userId: cuentaId, agentId: "system-prompt-ai" },
            orderBy: { updatedAt: "desc" },
            select: { sections: true },
        });
        const business = (prompt?.sections as { business?: unknown } | null)?.business;
        const nombre = typeof (business as { nombre?: unknown })?.nombre === "string"
            ? ((business as { nombre: string }).nombre).trim()
            : "";
        return { nombre, datos: losDatosDelNegocio(business) };
    } catch (error) {
        console.warn("[cotizacion-ia] no se pudo leer el perfil del negocio", { cuentaId, error: String(error) });
        return { nombre: "", datos: [] };
    }
}

async function subirElPdf(cuentaId: string, bytes: Uint8Array, nombre: string): Promise<string> {
    const bucket = process.env.S3_BUCKET_NAME || "verzay-media";
    const base = (process.env.S3_PUBLIC_URL ?? "").replace(/\/+$/, "");
    if (!base) throw new Error("S3_PUBLIC_URL no está configurada");
    // El nombre del archivo va al final de la ruta: es lo que WhatsApp enseña
    // como nombre del documento. La carpeta con un uuid evita que dos
    // cotizaciones con el mismo número se pisen.
    const ruta = `cotizaciones/${cuentaId}/${randomUUID()}/${nombre}`;
    const buffer = Buffer.from(bytes);
    await minioClient.putObject(bucket, ruta, buffer, buffer.length, { "Content-Type": "application/pdf" });
    return `${base}/${bucket}/${ruta}`;
}

export async function prepararLaCotizacion(p: PeticionDeCotizacion): Promise<RespuestaDeCotizacion> {
    const [ajustes, catalogo] = await Promise.all([
        leerAjustesDeCotizacion(p.cuentaId),
        db.product.findMany({
            where: { userId: p.cuentaId, isActive: true },
            select: { id: true, title: true, sku: true, price: true, description: true },
        }),
    ]);

    const decision = decidirLaCotizacion({
        activa: ajustes.activa,
        pedidos: comoPedidos(p.items),
        pideCondicionesEspeciales: p.pideCondicionesEspeciales === true,
        detalleCondiciones: p.detalleCondiciones ?? null,
        catalogo: catalogo.map((c) => ({ ...c, price: Number(c.price) })),
    });
    if (decision.estado !== "lista") return decision;

    const [cliente, perfil, marca, zona, cuenta] = await Promise.all([
        elNombreDelCliente(p.cuentaId, p.remoteJid, p.nombreCliente),
        elPerfilDelNegocio(p.cuentaId),
        laMarcaDelNegocio(p.cuentaId),
        laZonaHorariaDeLaCuenta(p.cuentaId),
        db.user.findUnique({ where: { id: p.cuentaId }, select: { preferredCurrencyCode: true } }),
    ]);
    const moneda = cuenta?.preferredCurrencyCode ?? null;
    const telefono = elTelefonoDelJid(p.remoteJid);

    // Se apunta ANTES de armar el PDF: el número sale de su id, y así la
    // cotización queda en el módulo aunque la entrega falle después.
    const creada = await db.cotizacion.create({
        data: {
            userId: p.cuentaId,
            clientName: cliente,
            clientPhone: telefono,
            status: "enviada",
            notes: ajustes.instrucciones || null,
            total: decision.total,
            items: {
                create: decision.lineas.map((l) => ({
                    productId: l.productoId,
                    title: l.titulo,
                    quantity: l.cantidad,
                    unitPrice: l.precioUnitario,
                    subtotal: l.subtotal,
                })),
            },
        },
        select: { id: true, createdAt: true },
    });
    const numero = elNumeroDeLaCotizacion(creada.id, creada.createdAt);

    const bytes = await cotizacionEnPdf({
        numero,
        fecha: creada.createdAt,
        zonaHoraria: zona,
        marca: { ...marca, nombre: perfil.nombre || marca.nombre },
        datosDelNegocio: perfil.datos,
        cliente,
        telefonoDelCliente: telefono,
        lineas: decision.lineas,
        total: decision.total,
        moneda,
        condiciones: ajustes.instrucciones,
    });
    const nombreDelArchivo = elNombreDelPdf(numero);
    const url = await subirElPdf(p.cuentaId, bytes, nombreDelArchivo);

    const totalLegible = elPrecio(decision.total, moneda);
    const resumen = decision.lineas
        .map((l) => `• ${l.titulo} x${l.cantidad} = ${elPrecio(l.subtotal)}`)
        .join("\n");
    return { estado: "lista", cotizacionId: creada.id, numero, url, nombreDelArchivo, total: decision.total, totalLegible, resumen };
}
