/**
 * El tablero de embudos de OTRA cuenta, y de todos sus asesores a la vez.
 *
 * Son dos ejes nuevos sobre el tablero que ya existía, y las reglas de los dos
 * viven aquí, puras: la pantalla y el servidor no pueden discrepar si es la
 * misma función la que dice qué se ofrece y qué se consulta.
 *
 * # 1. La cuenta: UNA, nunca varias
 *
 * Esta es la diferencia entera con el CRM y con Finanzas de la familia, y de
 * ella cuelga todo lo demás:
 *
 * | | qué hace el selector |
 * | --- | --- |
 * | Finanzas | marcar varias y **sumarlas** |
 * | CRM | quitar de un conjunto que por defecto son **todas** |
 * | **Embudos** | **elegir una**, y solo una |
 *
 * Y no es una preferencia de diseño: **las columnas de un tablero son las
 * etapas de un embudo, y un embudo es de una cuenta**. Dos cuentas tienen
 * embudos distintos, con etapas distintas y con ids distintos, así que no
 * existe ninguna columna en la que pudieran caer las tarjetas de las dos. Un
 * tablero «consolidado» tendría que inventarse las columnas —emparejando
 * etapas por su nombre, que es lo único que se parece— y entonces mover una
 * tarjeta escribiría una posición en un embudo que no es el de su
 * conversación. Por eso `laCuentaDelTablero` devuelve **una cadena y no una
 * lista**: no hay forma de pedir dos, ni desde la URL ni desde una acción.
 *
 * Y **cuáles se ofrecen es la misma pregunta que en Llamadas y en Finanzas**,
 * contestada por la misma función (`lasCuentasQueAlcanzaHaciaAbajo`): la propia
 * y las que cuelgan de ella, nunca su madre ni sus hermanas. Aquí hubo una copia
 * con una fuente de más —la cartera de clientes— y por eso el selector llegó a
 * ofrecer cuentas de toda la plataforma; está contado en
 * `lib/cuentas-hacia-abajo.server.ts`.
 *
 * # 2. El asesor: todos juntos por defecto
 *
 * El tablero enseñaba las conversaciones de los asesores que tienen ESE embudo
 * asignado, y no había forma de mirar a uno solo. Ahora el filtro tiene tres
 * estados —todos, uno, o las que no tienen asesor— y el de partida es «todos».
 *
 * Lo que hay que tener delante antes de tocarlo: **el filtro de asesor puede
 * cambiar de embudo, y tiene que poder.** Si se elige a alguien cuyo embudo es
 * otro, el tablero se va a SU embudo: es el único donde sus tarjetas tienen
 * posición y donde moverlas vale (`moverTarjetaAction` deduce el embudo de la
 * conversación, y esa regla no se toca). Sin eso, filtrar a ese asesor
 * enseñaría sus tarjetas en columnas ajenas y al arrastrarlas contestaría
 * «esta conversación cambió de embudo mientras tanto» — menú abierto, puerta
 * cerrada.
 *
 * # 3. El total de una etapa es un COUNT
 *
 * El tablero trae como mucho `TOPE_DE_TARJETAS` (500), así que el número de la
 * cabecera de cada columna —que era `tarjetas.length`— **miente en cuanto una
 * cuenta pasa de ahí**: es la misma familia que *un contador es un `COUNT`, no
 * un `length`*. `losTotalesPorEtapa` reparte los conteos de verdad, y lo que
 * no tiene posición guardada —o la tiene en una etapa que ya se borró— cuenta
 * en la PRIMERA, exactamente donde `laEtapaDeLaConversacion` lo pinta.
 */

import type { Embudo, Etapa, QuienMira } from "@/lib/embudos";
import { elEmbudoDeLaConversacion, elEmbudoQueSeAbre } from "@/lib/embudos";

/** Una cuenta que se puede elegir en el tablero. */
export type CuentaDelTablero = {
    id: string;
    nombre: string;
    esLaPropia: boolean;
};

/**
 * Cuántas cuentas se ofrecen como mucho.
 *
 * Hoy no recorta nada —la familia mayor de la plataforma son cinco cuentas— y
 * está por lo mismo que `TOPE_DE_LA_FAMILIA`: la lista viaja entera al
 * navegador, así que tiene techo. Y lo que se recorta **se dice**, no
 * desaparece.
 */
export const TOPE_DE_CUENTAS = 200;

/**
 * Qué cuenta se mira: la pedida si de verdad se alcanza, y si no la propia.
 *
 * **Nunca devuelve vacío y nunca devuelve dos.** Un `?cuenta=` rancio de un
 * enlace guardado, o el id de una cuenta que se dejó de administrar, no es un
 * error que enseñar: es un id que ya no existe para quien pregunta, y lo que
 * toca entonces es su propio tablero.
 */
export function laCuentaDelTablero(
    pedida: unknown,
    alcanzables: readonly string[],
    propia: string,
): string {
    const casa = String(propia ?? "").trim();
    const id = typeof pedida === "string" ? pedida.trim() : "";
    if (!id || id === casa) return casa;
    const juego = new Set(alcanzables.map((c) => String(c ?? "").trim()).filter(Boolean));
    return juego.has(id) ? id : casa;
}

/**
 * ¿Se está mirando una cuenta que no es la propia?
 *
 * De aquí cuelga lo que la pantalla avisa: mirando otra cuenta, lo que se cree
 * y lo que se mueve es de ella, no de la de uno.
 */
export function esOtraCuenta(elegida: string, propia: string): boolean {
    const a = String(elegida ?? "").trim();
    const b = String(propia ?? "").trim();
    return Boolean(a) && a !== b;
}

/**
 * ¿Manda quien mira en la cuenta que está mirando?
 *
 * En la propia lo dice `canManageWorkspace`. En otra, **sí**: a otra cuenta
 * solo se llega bajando (`lasCuentasDeEmbudosQueAlcanza` devuelve `[propia]`
 * para quien no manda), así que tenerla delante ya significa administrarla. Es
 * el mismo reparto con el que se le editan sus clientes o sus finanzas.
 */
export function mandaEnLaCuenta(mandaEnLaPropia: boolean, elegida: string, propia: string): boolean {
    return esOtraCuenta(elegida, propia) ? true : mandaEnLaPropia;
}

/** Los tres estados del filtro de asesor. `todos` es el de partida. */
export type FiltroDeAsesor =
    | { tipo: "todos" }
    | { tipo: "sinAsignar" }
    | { tipo: "uno"; personaId: string };

export const TODOS_LOS_ASESORES = "__todos__";
export const SIN_ASIGNAR = "__sin_asignar__";

export const FILTRO_DE_TODOS: FiltroDeAsesor = { tipo: "todos" };

/**
 * El filtro de asesor, a partir de lo que llega del navegador.
 *
 * Un id que no es de esta cuenta cae en «todos»: una lista de personas que
 * llega de fuera no puede acotar una consulta, porque entonces preguntar por el
 * id de alguien de otra cuenta diría si tiene conversaciones aquí.
 */
export function elFiltroDeAsesor(pedido: unknown, equipo: readonly string[]): FiltroDeAsesor {
    const id = typeof pedido === "string" ? pedido.trim() : "";
    if (!id || id === TODOS_LOS_ASESORES) return FILTRO_DE_TODOS;
    if (id === SIN_ASIGNAR) return { tipo: "sinAsignar" };
    return equipo.includes(id) ? { tipo: "uno", personaId: id } : FILTRO_DE_TODOS;
}

/** Cómo vuelve el filtro a la URL. `null` = no se escribe nada. */
export function comoParametroDeAsesor(filtro: FiltroDeAsesor): string | null {
    if (filtro.tipo === "todos") return null;
    return filtro.tipo === "sinAsignar" ? SIN_ASIGNAR : filtro.personaId;
}

/**
 * Qué embudo abre el tablero, con el filtro de asesor puesto.
 *
 * - Filtrando a UN asesor, el suyo: es donde sus tarjetas tienen posición y
 *   donde moverlas vale. Se deduce con `elEmbudoDeLaConversacion`, la MISMA
 *   función con la que el servidor decide a qué embudo cae una conversación —si
 *   fueran dos, el tablero enseñaría unas tarjetas que al soltarlas dirían que
 *   cambiaron de embudo.
 * - Filtrando «sin asesor», el por defecto: ahí es donde caen.
 * - Y con «todos», el de siempre (`elEmbudoQueSeAbre`): el pedido si quien mira
 *   manda, y el suyo si es un asesor.
 */
export function elEmbudoDelTablero(
    quien: QuienMira,
    pedido: string | null | undefined,
    filtro: FiltroDeAsesor,
    asignaciones: Readonly<Record<string, string>>,
    embudos: readonly Embudo[],
): string | null {
    // Un asesor no filtra: solo ve lo suyo, en su embudo, pida lo que pida.
    if (!quien.manda) return elEmbudoQueSeAbre(quien, pedido, asignaciones, embudos);
    if (filtro.tipo === "uno") return elEmbudoDeLaConversacion(filtro.personaId, asignaciones, embudos);
    if (filtro.tipo === "sinAsignar") return elEmbudoDeLaConversacion(null, asignaciones, embudos);
    return elEmbudoQueSeAbre(quien, pedido, asignaciones, embudos);
}

/**
 * El total de conversaciones de cada etapa.
 *
 * `guardados` son los conteos de `embudo_posiciones` tal como los devuelve la
 * base: etapa → cuántas. `total` es el `COUNT` de las conversaciones del
 * tablero. La diferencia —las que no tienen posición guardada, y las que la
 * tienen en una etapa borrada— cae en la PRIMERA etapa, que es justo donde
 * `laEtapaDeLaConversacion` las pinta.
 *
 * Se calcula así y no contando tarjetas porque el tablero trae como mucho 500:
 * con el `length`, una cuenta grande enseña en cada columna «cuántas de las
 * primeras 500 cayeron aquí», que no es un dato que nadie pueda usar.
 */
export function losTotalesPorEtapa(
    etapas: readonly Etapa[],
    guardados: Readonly<Record<string, number>>,
    total: number,
): Record<string, number> {
    const totales: Record<string, number> = {};
    for (const e of etapas) totales[e.id] = 0;
    if (etapas.length === 0) return totales;

    let colocadas = 0;
    for (const e of etapas) {
        const cuantas = Math.max(0, Math.floor(Number(guardados[e.id] ?? 0)) || 0);
        totales[e.id] = cuantas;
        colocadas += cuantas;
    }

    const primera = [...etapas].sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))[0];
    // Nunca negativo: entre el `COUNT` y el `GROUP BY` puede entrar una
    // conversación, y un número negativo en una cabecera no significa nada.
    totales[primera.id] += Math.max(0, Math.floor(total) - colocadas);
    return totales;
}

/**
 * A quién se le miran las conversaciones: UNA decisión, y de ella salen las dos
 * consultas del tablero —las tarjetas y el conteo por etapa—.
 *
 * Existe como dato y no como un `where` porque las dos consultas no se escriben
 * igual: una va con Prisma y la otra en SQL en crudo, porque tiene que unir
 * `embudo_posiciones`, que es tabla nuestra. Con la condición escrita dos veces,
 * el día que se afine una las cabeceras contarían una cosa y las columnas
 * enseñarían otra — y eso no se ve como un error, se ve como un número que no
 * cuadra con lo que hay debajo.
 */
export type AQuienSeMira =
    /** Un asesor concreto: el filtro puesto, o un asesor mirando lo suyo. */
    | { tipo: "una-persona"; personaId: string }
    /** Las que no tiene nadie. Caen en el embudo por defecto. */
    | { tipo: "sin-asesor" }
    /** Los asesores de ESTE embudo. */
    | { tipo: "estos"; asesores: string[] }
    /**
     * Todos menos los asesores de los OTROS embudos. Es el embudo por defecto:
     * entran además las que no tienen asesor y las de quien no tiene embudo.
     */
    | { tipo: "todos-menos"; ajenos: string[] };

/**
 * A quién mira este tablero, dado quién abre y qué filtro tiene puesto.
 *
 * Un asesor ve lo suyo y nada más, pida lo que pida: es la misma regla que ya
 * decidía su embudo, y por eso el filtro de asesor no se le ofrece.
 */
export function aQuienSeMira(
    quien: QuienMira,
    filtro: FiltroDeAsesor,
    reparto: { asesores: string[]; incluyeSinEmbudo: boolean; ajenos: string[] },
): AQuienSeMira {
    if (!quien.manda) return { tipo: "una-persona", personaId: quien.personaId };
    if (filtro.tipo === "uno") return { tipo: "una-persona", personaId: filtro.personaId };
    if (filtro.tipo === "sinAsignar") return { tipo: "sin-asesor" };
    return reparto.incluyeSinEmbudo
        ? { tipo: "todos-menos", ajenos: reparto.ajenos }
        : { tipo: "estos", asesores: reparto.asesores };
}
