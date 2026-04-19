import { ESTADOS_POR_TIPO } from "@/types/registro";
import { TipoRegistro } from "@prisma/client";

export function getEstadoOptions(tipo: TipoRegistro): string[] {
    return ESTADOS_POR_TIPO[tipo] ?? [];
}
