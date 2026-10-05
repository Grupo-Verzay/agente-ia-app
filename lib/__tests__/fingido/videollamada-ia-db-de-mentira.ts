// Doble de la base para el banco de la persona derivada: la copia guardada en memoria.
const copias = new Map<string, { derivadaPersonaId: string; huella: string }>();
export async function laCopiaGuardada(origen: string) { return copias.get(origen) ?? null; }
export async function guardarLaCopia(origen: string, derivada: string, huella: string) {
    copias.set(origen, { derivadaPersonaId: derivada, huella });
}
