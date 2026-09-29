import "server-only";

import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { puedeAdministrarEvolution } from "@/lib/puerta-de-evolution";

type PersonaDeLaSesion = Parameters<typeof cuentaQueManda>[0] & {
    rolDeLaPersona?: string | null;
    porImpersonacion?: boolean | null;
};

/**
 * La puerta de Evolution con la sesión delante: resuelve la cuenta que manda y
 * decide con `puedeAdministrarEvolution`. La usan `/evo`, Panel › Evo y sus
 * acciones (`getEvoServers`, `forceDeleteEvoInstance`): con la condición
 * escrita en cada sitio, una pantalla abre y la de al lado no.
 */
export async function laSesionAdministraEvolution(
    persona: PersonaDeLaSesion | null | undefined,
): Promise<boolean> {
    if (!persona) return false;
    const cuenta = await cuentaQueManda(persona);
    return puedeAdministrarEvolution(persona, cuenta.role);
}
