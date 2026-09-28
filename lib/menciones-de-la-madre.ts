/**
 * # Mencionar en una nota interna a los administradores de la cuenta MADRE
 *
 * Una cuenta hija que tiene madre puede mencionar, en la nota interna de una
 * conversación, a los administradores de esa madre —por su nombre real, no por
 * la palabra «Administrador»—, además de a la gente de su propia cuenta.
 *
 * **Solo para AVISAR.** Una mención a un administrador de la madre le saca la
 * misma ventana que interrumpe del chat de equipo, con la nota entera dentro, y
 * nada más: **no abre ninguna conversación, no da acceso por mención y no toca
 * ningún alcance**. Los vínculos siguen yendo solo de madre a hija. Por eso los
 * de la madre van en una lista APARTE de `elEquipoDeLaCuenta`: meterlos ahí los
 * haría también asignables y participantes.
 *
 * Todo lo que decide vive aquí y es puro, para que la pantalla (qué se ofrece)
 * y el servidor (qué se acepta) no puedan discrepar.
 */

export type EnlaceMadreHija = { de: string; a: string };

/**
 * Las cuentas MADRE de `cuenta`: las que la vincularon bajo la suya (`de → a`).
 *
 * Con dos condiciones, y cada una tapa un caso de la malla de
 * `linked_accounts`:
 *
 * 1. **La raíz de la familia no tiene madre.** Aunque una hija la haya
 *    vinculado de vuelta, eso no la hace hija de nadie.
 * 2. **Una pareja recíproca (`A ↔ B`) no es madre e hija**, salvo que una de
 *    las dos sea la raíz: un enlace de ida y vuelta entre hermanas no dice
 *    quién manda, y el lado seguro es que ninguna sea madre de la otra.
 */
export function lasMadresDe(
    cuenta: string,
    enlaces: readonly EnlaceMadreHija[],
    raiz: string,
): string[] {
    const propia = String(cuenta ?? "").trim();
    if (!propia || propia === raiz) return [];
    const haciaArriba = new Set(enlaces.filter((e) => e.de === propia).map((e) => e.a));
    const salida: string[] = [];
    for (const e of enlaces) {
        if (e.a !== propia || !e.de || e.de === propia || salida.includes(e.de)) continue;
        const reciproco = haciaArriba.has(e.de);
        if (reciproco && e.de !== raiz) continue;
        salida.push(e.de);
    }
    return salida;
}

export type Mencionable = { id: string; name: string | null; email?: string | null };

/** Cuántas sugerencias se enseñan a la vez (las de siempre). */
export const TOPE_DE_SUGERENCIAS = 6;

/**
 * Lo que ofrece el selector de `@`: la gente de la cuenta y, detrás, los
 * administradores de la madre, con el MISMO filtro (nombre o correo) y sin
 * repetir a nadie. Los dos van por la misma fila del selector: se leen igual.
 */
export function losMencionables(
    equipo: readonly Mencionable[],
    deLaMadre: readonly Mencionable[],
    consulta: string,
    tope: number = TOPE_DE_SUGERENCIAS,
): Mencionable[] {
    const q = String(consulta ?? "").toLowerCase();
    const vistos = new Set<string>();
    const salida: Mencionable[] = [];
    for (const a of [...equipo, ...deLaMadre]) {
        if (!a?.id || !a.name || vistos.has(a.id)) continue;
        const casa =
            a.name.toLowerCase().includes(q) || (a.email ?? "").toLowerCase().includes(q);
        if (!casa) continue;
        vistos.add(a.id);
        salida.push(a);
        if (salida.length >= tope) break;
    }
    return salida;
}

/**
 * Reparte los ids mencionados que llegan del navegador en dos: los del equipo
 * (el camino de siempre: campanita y, a un agente, acceso por mención) y los de
 * la madre (solo el aviso). Lo que no está en ninguna de las dos listas, o es
 * uno mismo, se descarta: el navegador no decide a quién se avisa.
 */
export function separarLasMenciones(
    mencionados: readonly string[],
    equipo: ReadonlyMap<string, unknown>,
    deLaMadre: ReadonlySet<string>,
    yo: string,
): { delEquipo: string[]; deLaMadre: string[]; descartados: string[] } {
    const delEquipo: string[] = [];
    const madre: string[] = [];
    const descartados: string[] = [];
    for (const id of mencionados) {
        if (!id || id === yo || delEquipo.includes(id) || madre.includes(id)) continue;
        if (equipo.has(id)) delEquipo.push(id);
        else if (deLaMadre.has(id)) madre.push(id);
        else descartados.push(id);
    }
    return { delEquipo, deLaMadre: madre, descartados };
}

/** El título del aviso: quién te mencionó y en qué conversación. */
export function tituloDeLaMencionEnNota(
    persona: string | null | undefined,
    cuentaHija: string | null | undefined,
): string {
    const quien = persona?.trim() || "Alguien de una cuenta hija";
    const donde = cuentaHija?.trim();
    return donde
        ? `${quien} te mencionó en una nota interna de ${donde}`
        : `${quien} te mencionó en una nota interna`;
}
