/**
 * Quién manda en una familia de cuentas, cuando los enlaces van en los DOS
 * sentidos.
 *
 * # Por qué hacía falta escribir esto
 *
 * `linked_accounts` se leyó siempre como un árbol de un nivel: una fila dice
 * «esta cuenta cuelga de esta otra», así que la madre es aquella de la que
 * cuelgo. **En producción no es un árbol: es una malla con ciclos.**
 *
 * Medido contra la base de producción, la familia de Verzay son cinco cuentas
 * y **diez** filas cruzadas en los dos sentidos: Carlos las vinculó a las
 * cuatro bajo la suya, y antes de eso dos de ellas —Ventas y Notificaciones—
 * lo habían vinculado a él bajo las suyas, más tres enlaces sueltos entre
 * hermanas. De las 13 filas que hay en toda la plataforma, **8 son parejas
 * recíprocas**: no es un accidente de una cuenta, es cómo se usa la tabla.
 *
 * Con una malla, «de quién cuelgo» **no tiene respuesta**: casi todas cuelgan
 * de alguien. Y la consulta de antes se quedaba con la primera por `id ASC`,
 * o sea **el orden alfabético de un uuid**, así que cada cuenta de la misma
 * familia elegía una raíz distinta.
 *
 * # La regla
 *
 * > **Manda quien más cuentas vinculó BAJO la suya**, y a igualdad, la de `id`
 * > menor.
 *
 * No se inventa ninguna jerarquía: se cuenta lo que cada cuenta **declaró** al
 * vincular a otra bajo la suya. Y lo que la hace utilizable es que es una
 * función pura del conjunto —los mismos miembros y los mismos enlaces—, así
 * que **las cinco calculan la misma raíz**, que es justo lo que el orden por
 * `id` no garantizaba.
 *
 * En una familia normal —una madre que vinculó a sus hijas y nadie más— la
 * madre tiene N y las hijas 0, así que sale **la misma raíz que antes**. Esto
 * solo cambia algo donde los enlaces van en los dos sentidos, que es donde
 * antes se equivocaba.
 */

/** Un enlace de `linked_accounts`: `de` vinculó a `a` bajo su cuenta. */
export type EnlaceDeCuentas = { de: string; a: string };

export function laRaizQueManda(cuentas: readonly string[], enlaces: readonly EnlaceDeCuentas[]): string {
    const miembros = Array.from(
        new Set(cuentas.map((c) => String(c ?? "").trim()).filter(Boolean)),
    ).sort();
    if (miembros.length === 0) return "";
    if (miembros.length === 1) return miembros[0];

    const dentro = new Set(miembros);
    const cuantas = new Map<string, number>(miembros.map((c) => [c, 0]));

    // Se cuentan los enlaces una sola vez por pareja: dos filas `A -> B`
    // repetidas no pueden hacer que A mande más que quien vinculó a dos
    // cuentas distintas.
    const vistos = new Set<string>();
    for (const enlace of enlaces) {
        const de = String(enlace?.de ?? "").trim();
        const a = String(enlace?.a ?? "").trim();
        if (!de || !a || de === a) continue;
        if (!dentro.has(de) || !dentro.has(a)) continue;
        const llave = `${de}>${a}`;
        if (vistos.has(llave)) continue;
        vistos.add(llave);
        cuantas.set(de, (cuantas.get(de) ?? 0) + 1);
    }

    // `miembros` ya viene ordenado, así que el `>` estricto deja ganar al de
    // `id` menor cuando empatan. Sin ese desempate estable, dos cuentas de la
    // misma familia podrían elegir raíces distintas y el hilo se partiría
    // otra vez.
    let raiz = miembros[0];
    let mejor = cuantas.get(raiz) ?? 0;
    for (const c of miembros) {
        const n = cuantas.get(c) ?? 0;
        if (n > mejor) {
            mejor = n;
            raiz = c;
        }
    }

    return raiz;
}
