/**
 * El nombre comercial de un NIVEL de plan, que es UNO.
 *
 * Cada nivel (Nivel 1..6) se guarda en varias filas de `subscription_plans`:
 * una por tipo de asistencia (IA y Humano) y, aparte, las que se le venden a
 * los resellers. Cada fila tenía su propio `name`, y el panel solo escribía el
 * de la fila que se estaba editando. Así que al renombrar un nivel desde la
 * pestaña de IA, la fila de Humano —la que está a la venta y la que pinta la
 * landing— se quedaba con el nombre ANTERIOR, sin un solo error: la landing
 * seguía vendiendo «Estárter» cuando el nivel ya se llamaba «Starter».
 *
 * La regla, y es una sola para todas las pantallas que enseñan el nombre de un
 * plan de la plataforma (la landing, la página del plan, el panel de Planes,
 * elegir plan, las etiquetas de la barra):
 *
 *   1. Manda el nombre escrito más RECIENTE de las filas de la plataforma
 *      (`isResellerPlan` falso), sea del tipo de asistencia que sea.
 *   2. Si ninguna de esas tiene nombre, el más reciente de las que se venden a
 *      resellers.
 *   3. Sin ninguno, la etiqueta del nivel («Nivel 3»). Nunca un nombre
 *      inventado: lo único cierto de un nivel sin nombre es su número.
 *
 * Y guardar un nombre en el panel lo escribe en TODAS las filas del nivel
 * (`upsertSubscriptionPlan`), así que a partir de ahí las filas no discrepan.
 * La regla de arriba es la red para lo que ya estaba escrito distinto.
 *
 * Puro y sin imports de servidor: lo usan el lector del servidor y el banco.
 */

export type FilaConNombre = {
    plan: string;
    name: string | null;
    isResellerPlan: boolean;
    updatedAt: Date | string | null;
};

const ETIQUETA_DEL_NIVEL: Readonly<Record<string, string>> = {
    lite: "Nivel 1",
    basico: "Nivel 2",
    intermedio: "Nivel 3",
    avanzado: "Nivel 4",
    enterprise: "Nivel 5",
    personalizado: "Nivel 6",
};

function cuando(valor: Date | string | null): number {
    if (!valor) return 0;
    const t = valor instanceof Date ? valor.getTime() : new Date(valor).getTime();
    return Number.isFinite(t) ? t : 0;
}

/**
 * El nombre vigente de cada nivel que tiene alguno escrito. Un nivel sin nombre
 * en ninguna fila no aparece: quien pregunta cae en la etiqueta del nivel.
 */
export function losNombresDeLosNiveles(filas: readonly FilaConNombre[]): Record<string, string> {
    const mejor = new Map<string, { nombre: string; deLaPlataforma: boolean; t: number }>();
    for (const fila of filas) {
        const nombre = fila.name?.trim();
        if (!nombre) continue;
        const candidato = { nombre, deLaPlataforma: !fila.isResellerPlan, t: cuando(fila.updatedAt) };
        const actual = mejor.get(fila.plan);
        if (
            !actual ||
            (candidato.deLaPlataforma && !actual.deLaPlataforma) ||
            (candidato.deLaPlataforma === actual.deLaPlataforma && candidato.t > actual.t)
        ) {
            mejor.set(fila.plan, candidato);
        }
    }
    const nombres: Record<string, string> = {};
    for (const [plan, { nombre }] of mejor) nombres[plan] = nombre;
    return nombres;
}

/** El nombre que se enseña de un nivel: el vigente o, sin él, «Nivel N». */
export function elNombreDelNivel(plan: string, nombres: Readonly<Record<string, string>>): string {
    return nombres[plan] || ETIQUETA_DEL_NIVEL[plan] || plan;
}

/**
 * La misma lista de planes con el nombre vigente de su nivel puesto en `name`.
 * No toca nada más de cada fila: precio, tipo y si está activa siguen siendo
 * los suyos.
 */
export function conElNombreDelNivel<T extends { plan: string; name: string | null }>(
    planes: readonly T[],
    nombres: Readonly<Record<string, string>>,
): T[] {
    return planes.map((p) => ({ ...p, name: nombres[p.plan] ?? p.name ?? null }));
}
