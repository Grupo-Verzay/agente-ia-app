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
    if (nonEmpty(business.notas)) {
        lines.push('');
        lines.push('### NOTAS ADICIONALES\n');
        lines.push(business.notas ? business.notas.trim() : '');
    }
    return lines.join('\n');
}
