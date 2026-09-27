import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { elNombreSeguroDelAdjunto } from "@/lib/correo";
import { elBuzonDe } from "@/lib/correo-db";
import { elProveedorDe, ErrorDeCorreo } from "@/lib/correo-proveedores.server";

export const dynamic = "force-dynamic";

/**
 * Descarga un adjunto. Es una ruta y no una acción porque devuelve BYTES:
 * por una acción de servidor viajarían serializados.
 *
 * La puerta es la de todo Correo: el buzón se busca con la persona de la
 * sesión en el `WHERE`, así que con el id del buzón de otra persona contesta
 * «no está», igual que con uno inventado. Ninguna rama devuelve el adjunto sin
 * pasar por ahí.
 *
 * Se sirve como descarga (`attachment`) y con `nosniff`: un HTML adjunto
 * abierto en línea correría con el origen de la plataforma.
 */
export async function GET(req: Request) {
    const user = await currentUser();
    if (!user?.id) return new Response("No autorizado", { status: 401 });
    const persona = laPersonaQueActua(user as any);

    const q = new URL(req.url).searchParams;
    const buzonId = q.get("buzon") ?? "";
    const correoId = q.get("correo") ?? "";
    const adjuntoId = q.get("adjunto") ?? "";
    if (!buzonId || !correoId || !adjuntoId) return new Response("Faltan datos", { status: 400 });

    const buzon = await elBuzonDe(persona.id, buzonId);
    if (!buzon) return new Response("No encontrado", { status: 404 });

    try {
        const a = await elProveedorDe(buzon).adjunto(buzon, correoId, adjuntoId);
        const nombre = elNombreSeguroDelAdjunto(a.nombre);
        return new Response(new Uint8Array(a.bytes), {
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename="${nombre.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "private, no-store",
            },
        });
    } catch (e) {
        const motivo = e instanceof ErrorDeCorreo ? e.message : "No se pudo descargar el adjunto.";
        console.warn("[correo] no se pudo bajar el adjunto", motivo);
        return new Response(motivo, { status: 502 });
    }
}
