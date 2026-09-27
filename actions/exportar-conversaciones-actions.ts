"use server";

import { currentUser } from "@/lib/auth";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import {
    elNombreDelArchivoDelChat,
    formatearConversacion,
    TOPE_DE_CONVERSACIONES_POR_LOTE,
} from "@/lib/conversacion-legible";
import {
    leerLaConversacion,
    losNombresDeLaConversacion,
    resolveInstanceOwner,
} from "@/lib/exportar-conversaciones.server";

/**
 * Exportar conversaciones de Chats: una sola (el menú «Acciones» de la
 * cabecera) o varias (la barra de acciones en lote). Es UNA acción para las
 * dos: exportar una es exportar un lote de uno, y con dos caminos el día que
 * se afine el formato uno se queda atrás.
 *
 * # La puerta
 *
 * Es la de la bandeja: la línea de cada conversación tiene que ser de una
 * cuenta que quien pide alcanza (`getAssociatedAccountIds`: la propia y las que
 * cuelgan de ella, nunca hacia arriba ni hacia los lados). Lo que llega del
 * navegador —línea, contacto, identidades— **no decide a qué se llega**: la
 * dueña de la línea sale de `Instancias`. Una conversación de otra cuenta se
 * contesta igual que una que no existe, y se cuenta en `omitidas`.
 *
 * # Lo que devuelve
 *
 * El TEXTO de cada archivo, no el archivo: armar el `.zip` es trabajo del
 * navegador (`descargarExportacion`), que es quien lo baja. Así la acción no
 * sabe nada de formatos de descarga y el banco prueba el texto directamente.
 */
export interface PedidoDeExportacion {
    instanceName: string;
    remoteJid: string;
    aliases?: string[];
}

export type ResultadoDeLaExportacion =
    | {
          success: true;
          archivos: { nombre: string; contenido: string }[];
          omitidas: number;
          recortadas: number;
          message: string;
      }
    | { success: false; message: string };

const TOPE_DE_ALIAS = 24;

function comoPedidos(raw: unknown): PedidoDeExportacion[] {
    if (!Array.isArray(raw)) return [];
    const vistos = new Set<string>();
    const salida: PedidoDeExportacion[] = [];
    for (const p of raw) {
        const instanceName = typeof p?.instanceName === "string" ? p.instanceName.trim() : "";
        const remoteJid = typeof p?.remoteJid === "string" ? p.remoteJid.trim() : "";
        if (!instanceName || !remoteJid) continue;
        const clave = `${instanceName}::${remoteJid}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        const aliases = Array.isArray(p?.aliases)
            ? (p.aliases as unknown[]).filter((a): a is string => typeof a === "string" && a.trim() !== "").slice(0, TOPE_DE_ALIAS)
            : [];
        salida.push({ instanceName, remoteJid, aliases });
    }
    return salida;
}

function elNumero(jid: string): string | null {
    const [digitos, dominio] = jid.split("@");
    if (dominio !== "s.whatsapp.net" && dominio !== "c.us") return null;
    return /^\d{6,15}$/.test(digitos ?? "") ? `+${digitos}` : null;
}

export async function exportarConversacionesAction(
    raw: unknown,
    zonaHoraria?: unknown,
): Promise<ResultadoDeLaExportacion> {
    const user = await currentUser();
    if (!user?.id) return { success: false, message: "No autorizado." };

    const pedidos = comoPedidos(raw);
    if (pedidos.length === 0) return { success: false, message: "No hay conversaciones que exportar." };
    const recortadoElLote = pedidos.length > TOPE_DE_CONVERSACIONES_POR_LOTE;
    const aExportar = pedidos.slice(0, TOPE_DE_CONVERSACIONES_POR_LOTE);
    const zona = typeof zonaHoraria === "string" && zonaHoraria.length < 64 ? zonaHoraria : undefined;

    const alcanza = new Set(await getAssociatedAccountIds(user as any));
    const exportadaEn = new Date();
    const archivos: { nombre: string; contenido: string }[] = [];
    let omitidas = 0;
    let recortadas = 0;

    // En serie: son lecturas largas contra `chat_messages`, y el pool de
    // Prisma es de diez por proceso — los mismos turnos que atienden la
    // bandeja y el chat abierto.
    for (const p of aExportar) {
        try {
            const dueno = await resolveInstanceOwner(p.instanceName);
            if (!dueno?.userId || !alcanza.has(dueno.userId)) {
                console.warn("[exportar] conversación fuera del alcance de quien pide", {
                    instanceName: p.instanceName,
                    quien: user.sessionUserId ?? user.id,
                });
                omitidas++;
                continue;
            }
            const [lectura, nombres] = await Promise.all([
                leerLaConversacion({
                    // Todas las cuentas que se alcanzan, acotadas a ESTA línea: el
                    // historial de una línea puede estar guardado bajo el dueño
                    // anterior, y dentro del alcance eso no abre nada nuevo.
                    userIds: Array.from(alcanza),
                    instanceName: p.instanceName,
                    remoteJid: p.remoteJid,
                    aliases: p.aliases,
                }),
                losNombresDeLaConversacion({
                    duenoId: dueno.userId,
                    instanceName: p.instanceName,
                    instanceId: dueno.instanceId ?? null,
                    remoteJid: p.remoteJid,
                    aliases: p.aliases,
                }),
            ]);
            const numero = elNumero(p.remoteJid);
            const contacto = nombres.contacto || numero || p.remoteJid.split("@")[0];
            if (lectura.recortada) recortadas++;
            archivos.push({
                nombre: elNombreDelArchivoDelChat(contacto, numero),
                contenido: formatearConversacion(
                    {
                        contacto,
                        numero,
                        linea: nombres.linea,
                        mensajes: lectura.mensajes,
                        recortada: lectura.recortada,
                    },
                    { exportadaEn, zonaHoraria: zona },
                ),
            });
        } catch (error) {
            // Una conversación que no se pudo leer no tumba el lote, pero no es
            // muda: se cuenta y se escribe.
            console.error("[exportar] no se pudo leer una conversación", p.instanceName, error);
            omitidas++;
        }
    }

    if (archivos.length === 0) {
        return { success: false, message: "No se pudo exportar ninguna de las conversaciones." };
    }
    const partes = [
        `${archivos.length} conversación${archivos.length === 1 ? "" : "es"} exportada${archivos.length === 1 ? "" : "s"}.`,
        omitidas ? `${omitidas} no se pudo${omitidas === 1 ? "" : "ieron"} exportar.` : "",
        recortadoElLote ? `Se exportan como mucho ${TOPE_DE_CONVERSACIONES_POR_LOTE} por vez.` : "",
        recortadas ? `${recortadas} traía${recortadas === 1 ? "" : "n"} demasiados mensajes y va${recortadas === 1 ? "" : "n"} con los más recientes.` : "",
    ].filter(Boolean);
    return { success: true, archivos, omitidas, recortadas, message: partes.join(" ") };
}
