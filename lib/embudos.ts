/**
 * Embudos: las reglas, puras y sin imports (salvo los colores, que se comparten
 * con Etiquetas).
 *
 * Un embudo es de la CUENTA. Lo crean y lo editan el dueño y los
 * administradores —los dos «mandan», con los mismos permisos—, y cada asesor
 * tiene asignado UNO. El asesor ve solo ese, con solo sus conversaciones, y lo
 * único que puede hacer en él es mover sus tarjetas de etapa.
 *
 * Todo lo que decide «qué ve quién» y «dónde cae cada conversación» vive aquí,
 * y lo usan la pantalla y el servidor. Con la regla escrita en los dos lados, el
 * día que se afine una la otra se queda atrás, y eso no se ve como un error: se
 * ve como una tarjeta que sale en el tablero y al moverla dice «No autorizado».
 *
 * # De qué embudo es una conversación
 *
 * No se guarda: se **deduce del asesor que la lleva**. Guardarlo obligaría a
 * que cada camino que reasigna una conversación —la bandeja, la transferencia,
 * el reparto automático, el escalado, el backend— se acordara de moverla de
 * embudo, y el que se olvide la deja en un tablero que ya no es el suyo.
 *
 * - Lleva asesor, y ese asesor tiene embudo → ese embudo.
 * - Sin asesor, o con uno que no tiene embudo (el dueño que la tomó él mismo,
 *   alguien que salió del equipo) → el embudo **por defecto** de la cuenta.
 *
 * # En qué etapa está
 *
 * Se guarda **por conversación y embudo**. Así, si pasa a un asesor con otro
 * embudo entra en la primera etapa de ese, y si vuelve recupera la que tenía.
 * Una etapa guardada que ya no existe —se borró— también cae en la primera: una
 * tarjeta nunca desaparece del tablero por culpa de su etapa.
 *
 * Y de ahí sale, gratis, la regla que se pidió escrita: **toda conversación que
 * no está en ninguna etapa entra en la primera, que es «Nuevo»** —porque
 * `nuevo` es de sistema y no se puede mover de posición—; y **si ya está en una
 * etapa se queda**, porque lo guardado manda y nadie lo reescribe cuando el
 * contacto vuelve a escribir.
 *
 * # Las tres etapas de sistema
 *
 * `Nuevo` (siempre la primera), `Ganado` y `Perdido` (siempre las últimas, en
 * ese orden). No se borran, no se mueven y no cambian de color; **el nombre sí
 * se edita**. Las de en medio son del cliente: las cambia, las reordena, las
 * borra y añade las que quiera.
 *
 * La marca es una columna (`sistema`) y no la posición, y eso no es un detalle:
 * por posición, la etapa que el cliente añadiera al final se convertiría en
 * «Perdido» sin que nadie lo pidiera. Y no es el NOMBRE porque el nombre se
 * puede cambiar —de eso va la mitad de la regla—.
 *
 * Un embudo **creado antes de que esto existiera** no tiene ninguna etapa de
 * sistema, así que sus tres etapas siguen siendo del todo editables y su última
 * columna no tiene el botón de vaciar. No se reescribe ni una fila: ver
 * `asegurarElEmbudoPorDefecto` en `lib/embudos-db.ts`, que solo siembra las
 * siete donde no había nada que perder.
 */

import { COLORES_RAPIDOS, COLOR_SIN_ELEGIR, comoColorHex, mismoColor } from "@/lib/colores-rapidos";

export { COLORES_RAPIDOS, COLOR_SIN_ELEGIR, comoColorHex, mismoColor };

/** Las tres etapas que pone el sistema. `null` = una etapa del cliente. */
export type EtapaDeSistema = "nuevo" | "ganado" | "perdido";

export type Embudo = {
    id: string;
    nombre: string;
    porDefecto: boolean;
    orden: number;
};

export type Etapa = {
    id: string;
    embudoId: string;
    nombre: string;
    /** El color, en hex (`#RRGGBB`). `null` = el de su posición. */
    color: string | null;
    orden: number;
    /** `nuevo` | `ganado` | `perdido`, o `null` si es una etapa del cliente. */
    sistema: EtapaDeSistema | null;
};

/**
 * Las tres de sistema, con su color FIJO.
 *
 * El color no se guarda para estas: se deduce de la marca, así que no hay forma
 * de que una quede de otro color —ni desde la pantalla, ni con una petición a
 * mano, ni por una fila escrita a pulso—. El `nombre` es solo el de partida: se
 * puede cambiar.
 */
export const ETAPAS_DE_SISTEMA: Record<EtapaDeSistema, { nombre: string; color: string }> = {
    nuevo: { nombre: "Nuevo", color: COLOR_SIN_ELEGIR },
    ganado: { nombre: "Ganado", color: "#22C55E" },
    perdido: { nombre: "Perdido", color: "#EF4444" },
};

/** Lo que llega como marca de sistema se acepta solo si es una de las tres. */
export function comoEtapaDeSistema(valor: unknown): EtapaDeSistema | null {
    return valor === "nuevo" || valor === "ganado" || valor === "perdido" ? valor : null;
}

/**
 * Las siete etapas con las que nace un embudo. Las cuatro de en medio son del
 * cliente desde el primer día: se editan, se reordenan y se borran.
 */
export const ETAPAS_INICIALES: ReadonlyArray<{
    nombre: string;
    color: string;
    sistema: EtapaDeSistema | null;
}> = [
    { nombre: ETAPAS_DE_SISTEMA.nuevo.nombre, color: ETAPAS_DE_SISTEMA.nuevo.color, sistema: "nuevo" },
    { nombre: "Contactado", color: "#3B82F6", sistema: null },
    { nombre: "Interesado", color: "#A855F7", sistema: null },
    { nombre: "Cotizado", color: "#F59E0B", sistema: null },
    { nombre: "Negociación", color: "#F97316", sistema: null },
    { nombre: ETAPAS_DE_SISTEMA.ganado.nombre, color: ETAPAS_DE_SISTEMA.ganado.color, sistema: "ganado" },
    { nombre: ETAPAS_DE_SISTEMA.perdido.nombre, color: ETAPAS_DE_SISTEMA.perdido.color, sistema: "perdido" },
];

/**
 * Los nombres con los que nacían los embudos ANTES de las siete etapas.
 *
 * Solo se usan para reconocer un embudo **recién creado y sin estrenar** y
 * ponerle las siete: ver `asegurarElEmbudoPorDefecto`. No se usan para crear
 * nada.
 */
export const ETAPAS_INICIALES_VIEJAS = ["Nuevo", "En proceso", "Cerrado"] as const;

/**
 * La paleta VIEJA, por índice.
 *
 * Los colores de una etapa eran un índice de esta lista; ahora son hex libres,
 * como en Etiquetas. Esta tabla se queda **solo para leer** lo que ya está
 * guardado: sin ella, las etapas creadas antes perderían su color de golpe el
 * día del despliegue. No se escribe nunca.
 */
export const HEX_DEL_COLOR_VIEJO = [
    "#64748B",
    "#3B82F6",
    "#F59E0B",
    "#EF4444",
    "#16A34A",
    "#6B7280",
] as const;

/** Topes: una lista que llega del navegador no puede crecer sin fin. */
export const TOPE_DE_ETAPAS = 20;
export const TOPE_DE_NOMBRE = 40;
export const TOPE_DE_EMBUDOS = 30;
/** Cuántas tarjetas trae un tablero. Lo que quede fuera se dice. */
export const TOPE_DE_TARJETAS = 500;

/**
 * El color con el que se pinta una etapa.
 *
 * Una de sistema, el suyo y solo el suyo —da igual lo que tenga guardado—. Una
 * del cliente: el elegido, y si no eligió ninguno el de su posición, ciclando
 * los rápidos para que dos columnas seguidas no nazcan iguales.
 */
export function elColorDeLaEtapa(
    etapa: { color?: string | null; sistema?: EtapaDeSistema | null },
    posicion: number,
): string {
    const deSistema = comoEtapaDeSistema(etapa.sistema);
    if (deSistema) return ETAPAS_DE_SISTEMA[deSistema].color;
    const elegido = comoColorHex(etapa.color);
    if (elegido) return elegido;
    const n = COLORES_RAPIDOS.length;
    return COLORES_RAPIDOS[((posicion % n) + n) % n];
}

/** Un nombre saneado, o `null` si no queda nada. */
export function comoNombre(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const limpio = valor.replace(/\s+/g, " ").trim().slice(0, TOPE_DE_NOMBRE);
    return limpio || null;
}

/**
 * El embudo por defecto: el marcado, y si no hay ninguno marcado, el primero
 * por orden. Sin eso, en una cuenta donde nadie ha marcado uno las
 * conversaciones sin asesor no saldrían en ningún tablero.
 */
export function elEmbudoPorDefecto(embudos: readonly Embudo[]): Embudo | null {
    if (embudos.length === 0) return null;
    const ordenados = [...embudos].sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));
    return ordenados.find((e) => e.porDefecto) ?? ordenados[0];
}

/**
 * De qué embudo es una conversación, dado quién la lleva.
 *
 * `asignaciones` es persona → embudo. Un embudo asignado que ya no existe se
 * trata como «sin embudo»: la conversación cae en el por defecto en vez de
 * quedarse fuera de todos los tableros.
 */
export function elEmbudoDeLaConversacion(
    asesorId: string | null | undefined,
    asignaciones: Readonly<Record<string, string>>,
    embudos: readonly Embudo[],
): string | null {
    const existentes = new Set(embudos.map((e) => e.id));
    const suyo = asesorId ? asignaciones[asesorId] : undefined;
    if (suyo && existentes.has(suyo)) return suyo;
    return elEmbudoPorDefecto(embudos)?.id ?? null;
}

/**
 * Qué asesores caen en un embudo, para acotar la consulta de conversaciones.
 *
 * - `asesores`: los que tienen este embudo asignado.
 * - `incluyeSinEmbudo`: si es el por defecto, entran además las conversaciones
 *   sin asesor y las de asesores sin embudo — o sea, todas las que NO sean de
 *   `ajenos` (los asesores de los demás embudos).
 */
export function quienCaeEnElEmbudo(
    embudoId: string,
    asignaciones: Readonly<Record<string, string>>,
    embudos: readonly Embudo[],
): { asesores: string[]; incluyeSinEmbudo: boolean; ajenos: string[] } {
    const existentes = new Set(embudos.map((e) => e.id));
    const asesores: string[] = [];
    const ajenos: string[] = [];
    for (const [persona, embudo] of Object.entries(asignaciones)) {
        if (!existentes.has(embudo)) continue;
        if (embudo === embudoId) asesores.push(persona);
        else ajenos.push(persona);
    }
    const incluyeSinEmbudo = elEmbudoPorDefecto(embudos)?.id === embudoId;
    return { asesores, incluyeSinEmbudo, ajenos };
}

/**
 * La etapa de una conversación en un embudo: la guardada si sigue existiendo en
 * ESE embudo, y si no, la primera.
 *
 * La primera es «Nuevo» en cuanto el embudo tiene sus etapas de sistema, porque
 * `nuevo` no se puede mover de posición. De ahí sale sin ninguna rama la regla
 * de que **lo que no está en ninguna etapa entra en Nuevo**, y la otra mitad
 * —**lo que ya está en una se queda**— es que lo guardado manda: nada lo
 * reescribe cuando el contacto vuelve a escribir.
 */
export function laEtapaDeLaConversacion(
    guardada: string | null | undefined,
    etapasDelEmbudo: readonly Etapa[],
): string | null {
    if (etapasDelEmbudo.length === 0) return null;
    if (guardada && etapasDelEmbudo.some((e) => e.id === guardada)) return guardada;
    const primera = [...etapasDelEmbudo].sort((a, b) => a.orden - b.orden)[0];
    return primera.id;
}

/** La etapa de sistema que se pide, si el embudo la tiene. */
export function laEtapaDeSistema(
    etapas: readonly Etapa[],
    cual: EtapaDeSistema,
): Etapa | null {
    return etapas.find((e) => e.sistema === cual) ?? null;
}

/** Quién mira, en lo que a embudos importa. */
export type QuienMira = {
    /** La persona (firma). */
    personaId: string;
    /** Dueño o administrador: los dos tienen los mismos permisos. */
    manda: boolean;
};

/**
 * ¿Puede mover esta tarjeta? Quien manda, cualquiera; un asesor, solo las suyas.
 */
export function puedeMoverLaTarjeta(quien: QuienMira, asesorDeLaTarjeta: string | null | undefined): boolean {
    if (quien.manda) return true;
    return Boolean(asesorDeLaTarjeta) && asesorDeLaTarjeta === quien.personaId;
}

/**
 * Qué embudo abre quien mira.
 *
 * - Quien manda: el pedido si existe; si no, el por defecto.
 * - Un asesor: el suyo, pida lo que pida. Sin embudo asignado, ninguno — y la
 *   pantalla lo dice en vez de enseñarle el de otro.
 */
export function elEmbudoQueSeAbre(
    quien: QuienMira,
    pedido: string | null | undefined,
    asignaciones: Readonly<Record<string, string>>,
    embudos: readonly Embudo[],
): string | null {
    const existentes = new Set(embudos.map((e) => e.id));
    if (quien.manda) {
        if (pedido && existentes.has(pedido)) return pedido;
        return elEmbudoPorDefecto(embudos)?.id ?? null;
    }
    const suyo = asignaciones[quien.personaId];
    return suyo && existentes.has(suyo) ? suyo : null;
}

/** Una etapa tal como llega al guardar la lista entera. */
export type EtapaPedida = {
    id?: string | null;
    nombre: string;
    color: string | null;
    /** La resuelve el SERVIDOR por el id, nunca el navegador. */
    sistema: EtapaDeSistema | null;
};

/**
 * Pone las de sistema en su sitio: `nuevo` primera, `ganado` y `perdido` las
 * dos últimas en ese orden, y las del cliente en medio tal como vengan.
 *
 * Se aplica **al guardar, en el servidor**, así que no depende de que la
 * pantalla las mande bien ni de que alguien no las arrastre: una petición a
 * mano con «Perdido» en medio queda igual de ordenada. Lo que el embudo no
 * tenga —los creados antes— simplemente no aparece, y el resto conserva su
 * orden.
 */
export function conLasDeSistemaEnSuSitio<T extends { sistema: EtapaDeSistema | null }>(
    etapas: readonly T[],
): T[] {
    const deSistema = (cual: EtapaDeSistema) => etapas.filter((e) => e.sistema === cual);
    const delCliente = etapas.filter((e) => comoEtapaDeSistema(e.sistema) === null);
    return [...deSistema("nuevo"), ...delCliente, ...deSistema("ganado"), ...deSistema("perdido")];
}

/**
 * Sanea la lista de etapas que llega del navegador: nombres limpios, colores en
 * hex, ids que solo cuentan si son de ESTE embudo, sin repetidos, y entre 1 y
 * `TOPE_DE_ETAPAS`. Devuelve el motivo si no se puede guardar.
 *
 * Tres cosas que hay que mantener, y las tres son la misma idea —lo que llega
 * del navegador no decide nada de esto—:
 *
 * 1. **La marca de sistema sale de `deSistema`**, que es lo que dice la BASE
 *    para cada id, no lo que mande la pantalla. Si llegara de fuera, una
 *    petición a mano convertiría cualquier etapa en «Perdido» —y con ella se
 *    llevaría el botón de vaciar— o le quitaría la marca a las tres para poder
 *    borrarlas.
 * 2. **Una de sistema que no viene en la lista se RECHAZA**, con su nombre
 *    delante. Reinsertarla en silencio dejaría una pantalla que dice que se
 *    borró y una base que dice que no.
 * 3. **El color de una de sistema se fuerza al suyo.** No se rechaza: la
 *    pantalla no ofrece cambiarlo, así que un color ahí no es alguien
 *    desobedeciendo, es una lista vieja de una pestaña abierta.
 */
export function comoListaDeEtapas(
    valor: unknown,
    deSistema: Readonly<Record<string, EtapaDeSistema | null>>,
): { ok: true; etapas: EtapaPedida[] } | { ok: false; motivo: string } {
    if (!Array.isArray(valor)) return { ok: false, motivo: "La lista de etapas no es válida." };
    const idsDelEmbudo = new Set(Object.keys(deSistema));
    const vistos = new Set<string>();
    const etapas: EtapaPedida[] = [];
    for (const bruto of valor) {
        if (!bruto || typeof bruto !== "object") continue;
        const b = bruto as Record<string, unknown>;
        const nombre = comoNombre(b.nombre);
        if (!nombre) return { ok: false, motivo: "Todas las etapas necesitan un nombre." };
        const id = typeof b.id === "string" && idsDelEmbudo.has(b.id) && !vistos.has(b.id) ? b.id : null;
        if (id) vistos.add(id);
        const sistema = id ? (deSistema[id] ?? null) : null;
        etapas.push({
            id,
            nombre,
            color: sistema ? null : comoColorHex(b.color),
            sistema,
        });
    }
    if (etapas.length === 0) return { ok: false, motivo: "Un embudo necesita al menos una etapa." };
    if (etapas.length > TOPE_DE_ETAPAS) {
        return { ok: false, motivo: `Un embudo puede tener como mucho ${TOPE_DE_ETAPAS} etapas.` };
    }

    // Ninguna de sistema se puede quedar fuera.
    const faltan: string[] = [];
    for (const [id, marca] of Object.entries(deSistema)) {
        if (marca && !vistos.has(id)) faltan.push(ETAPAS_DE_SISTEMA[marca].nombre);
    }
    if (faltan.length > 0) {
        return {
            ok: false,
            motivo: `${faltan.join(", ")} ${faltan.length === 1 ? "no se puede" : "no se pueden"} eliminar: ${
                faltan.length === 1 ? "es una etapa" : "son etapas"
            } del sistema. Su nombre sí se puede cambiar.`,
        };
    }

    return { ok: true, etapas: conLasDeSistemaEnSuSitio(etapas) };
}

/**
 * ¿Se puede subir o bajar esta etapa en la lista que se está editando?
 *
 * Una de sistema no se mueve nunca, y **una del cliente tampoco puede saltar por
 * encima de `nuevo` ni por debajo de `ganado`/`perdido`**: el servidor las
 * devolvería a su sitio con `conLasDeSistemaEnSuSitio`, así que una flecha que
 * deja mover ahí es una flecha que hace algo y se deshace al guardar — lo que se
 * lee como que el orden no se guarda.
 *
 * Son dos funciones y no una porque contestan a dos flechas distintas, y el
 * banco las encadena con el ordenador del servidor: lo que estas dos dejan
 * hacer, aquel no lo tiene que corregir.
 */
export function sePuedeSubirLaEtapa(
    etapas: ReadonlyArray<{ sistema: EtapaDeSistema | null }>,
    i: number,
): boolean {
    if (i <= 0 || i >= etapas.length) return false;
    if (comoEtapaDeSistema(etapas[i].sistema) !== null) return false;
    return comoEtapaDeSistema(etapas[i - 1].sistema) === null;
}

export function sePuedeBajarLaEtapa(
    etapas: ReadonlyArray<{ sistema: EtapaDeSistema | null }>,
    i: number,
): boolean {
    if (i < 0 || i >= etapas.length - 1) return false;
    if (comoEtapaDeSistema(etapas[i].sistema) !== null) return false;
    return comoEtapaDeSistema(etapas[i + 1].sistema) === null;
}
