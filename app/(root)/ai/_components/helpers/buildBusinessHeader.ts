import z from "zod";
import { nonEmpty } from "./nonEmpty";
import { BusinessDraftSchema } from "@/types/agentAi";

export function buildBusinessHeader(business: z.infer<typeof BusinessDraftSchema>): string {
    const lines: string[] = [];
    lines.push(`## DATOS DEL NEGOCIO\n`);
    lines.push(`* **Nombre:** ${nonEmpty(business.nombre)}`);
    if (nonEmpty(business.sector)) lines.push(`* **Sector/Rubro:** ${business.sector}`);
    if (nonEmpty(business.ubicacion)) lines.push(`* **Ubicación/Dirección:** ${business.ubicacion}`);
    if (nonEmpty(business.horarios)) lines.push(`* **Horarios de atención:** ${business.horarios}`);
    if (nonEmpty(business.maps)) lines.push(`* **Google Maps:** ${business.maps}`);
    if (nonEmpty(business.telefono)) lines.push(`* **Número de contacto:** ${business.telefono}`);
    if (nonEmpty(business.email)) lines.push(`* **Correo electrónico:** ${business.email}`);
    if (nonEmpty(business.sitio)) lines.push(`* **Sitio web:** ${business.sitio}`);
    if (nonEmpty(business.facebook)) lines.push(`* **Facebook:** ${business.facebook}`);
    if (nonEmpty(business.instagram)) lines.push(`* **Instagram:** ${business.instagram}`);
    if (nonEmpty(business.tiktok)) lines.push(`* **TikTok:** ${business.tiktok}`);
    if (nonEmpty(business.youtube)) lines.push(`* **YouTube:** ${business.youtube}`);
    return lines.join('\n');
}

/** Renderiza el bloque de identidad del agente (va al inicio del prompt).
 *  Elimina cualquier sección de motor que pudiera estar en notas de datos anteriores,
 *  ya que el motor se genera programáticamente al final del prompt compuesto.
 */
export function buildIdentityBlock(business: z.infer<typeof BusinessDraftSchema>): string | null {
    const raw = business.notas?.trim();
    if (!raw) return null;
    // Quitar bloque de motor si existe (datos viejos lo tenían en notas)
    const identity = raw.replace(/#{1,3}\s*🔒\s*MOTOR[\s\S]*/i, '').trim();
    if (!identity) return null;
    return `## IDENTIDAD\n\n${identity}`;
}
