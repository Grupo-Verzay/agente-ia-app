import "server-only";

import { db } from "@/lib/db";
import { SIN_GRUPOS } from "@/lib/conversaciones-de-grupo";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import {
    TOPE_DE_TARJETAS,
    laEtapaDeLaConversacion,
    quienCaeEnElEmbudo,
    type Embudo,
    type Etapa,
    type QuienMira,
} from "@/lib/embudos";
import {
    FILTRO_DE_TODOS,
    aQuienSeMira,
    comoParametroDeAsesor,
    elEmbudoDelTablero,
    elFiltroDeAsesor,
    esOtraCuenta,
    losTotalesPorEtapa,
    mandaEnLaCuenta,
    type CuentaDelTablero,
    type FiltroDeAsesor,
} from "@/lib/embudos-de-la-cuenta";
import {
    comoWhereDeAsesor,
    laCuentaRecordada,
    lasAsignacionesDe,
    lasEtapasDe,
    lasPosicionesDe,
    losConteosPorEtapa,
    losEmbudosDe,
    recordarLaCuenta,
} from "@/lib/embudos-db";
import {
    lasCuentasDeEmbudosQueAlcanza,
    laPuertaPermiteLaCuenta,
    resolverLaCuentaDelTablero,
    type PersonaQueMira,
} from "@/lib/cuentas-de-embudos.server";
import { lasEtiquetasQueVe } from "@/lib/personales-db";

/**
 * Quién mira los embudos y sobre qué cuenta.
 *
 * - `cuentaId` es la cuenta cuyo tablero se está mirando: la propia, o una de
 *   las que cuelgan de ella si se eligió en el selector. **Nunca dos**: las
 *   columnas de un tablero son las etapas de UN embudo, y un embudo es de una
 *   cuenta (ver `lib/embudos-de-la-cuenta.ts`).
 * - `propia` es la fila EFECTIVA de quien mira, y sirve para saber si está en
 *   su casa o en otra cuenta.
 * - `personaId` es la PERSONA: con ella se asigna un embudo y con ella se sabe
 *   qué conversaciones son de un asesor (`Session.assignedAdvisorId` guarda
 *   personas).
 * - `manda`: dueño y administrador en la propia; en otra cuenta, siempre —a
 *   otra cuenta solo se llega administrándola—.
 */
export type QuienMiraLosEmbudos = QuienMira & { cuentaId: string; propia: string };

export type UsuarioQueMira = PersonaQueMira &
    Parameters<typeof laPersonaQueActua>[0] & { effectiveId: string };

export type TarjetaDeEmbudo = {
    id: number;
    pushName: string;
    remoteJid: string;
    etapaId: string;
    asesorId: string | null;
    tags: { id: number; name: string; color: string | null; slug: string }[];
    pendingFollowUps: number;
    leadScore: number | null;
    actualizadoEn: string;
};

export type PersonaDelEquipo = { id: string; nombre: string; rol: string | null };

export type TableroDeEmbudo = {
    /** Los embudos que esta persona puede abrir (quien manda: todos). */
    embudos: Embudo[];
    /** El abierto, o `null` si un asesor no tiene embudo asignado. */
    embudoId: string | null;
    etapas: Etapa[];
    tarjetas: TarjetaDeEmbudo[];
    /** Cuántas conversaciones caen en el embudo, aunque no se traigan todas. */
    total: number;
    /**
     * etapa → cuántas conversaciones tiene, de verdad. Un `COUNT`, no el
     * `length` de las tarjetas cargadas: con el tope de `TOPE_DE_TARJETAS` ese
     * número miente en cuanto una cuenta pasa de ahí.
     */
    totales: Record<string, number>;
    /** persona → embudo. Solo lo ve quien manda. */
    asignaciones: Record<string, string>;
    /** El equipo de la cuenta. Solo lo ve quien manda. */
    equipo: PersonaDelEquipo[];
    /** id → nombre, para pintar el asesor de cada tarjeta. */
    nombres: Record<string, string>;
    manda: boolean;
    personaId: string;
    /** La cuenta que se está mirando, y desde la que se mira. */
    cuentaId: string;
    cuentaNombre: string;
    esOtraCuenta: boolean;
    /** Las cuentas que se pueden elegir. `[]` = no se pinta el selector. */
    cuentas: CuentaDelTablero[];
    puedeElegirCuenta: boolean;
    cuentasRecortadas: boolean;
    /** El filtro de asesor puesto, tal cual vuelve a la URL. `null` = todos. */
    asesor: string | null;
};

/** El equipo de la cuenta: la cuenta misma y quien cuelga de ella. */
async function elEquipoDe(cuentaId: string): Promise<PersonaDelEquipo[]> {
    const filas = await db.user.findMany({
        where: { OR: [{ id: cuentaId }, { ownerId: cuentaId }] },
        select: { id: true, name: true, email: true, advisorRole: true, ownerId: true },
        orderBy: { name: "asc" },
    });
    return filas.map((f) => ({
        id: f.id,
        nombre: (f.name ?? "").trim() || f.email || "Sin nombre",
        rol: f.ownerId ? (f.advisorRole ?? null) : "dueno",
    }));
}

/**
 * Quién mira, y qué cuenta, con la pedida ya comprobada contra las que alcanza.
 *
 * Lo llaman la página y **todas** las acciones del tablero: la cuenta viaja en
 * la URL y en los parámetros, así que se re-resuelve en cada una. Esconder el
 * selector no cierra la petición directa.
 */
export async function quienMiraElTablero(
    user: UsuarioQueMira,
    cuentaPedida?: unknown,
): Promise<{
    quien: QuienMiraLosEmbudos;
    cuentas: CuentaDelTablero[];
    puedeElegirCuenta: boolean;
    cuentasRecortadas: boolean;
}> {
    const alcance = await resolverLaCuentaDelTablero(user, cuentaPedida);
    return {
        quien: {
            cuentaId: alcance.elegida,
            propia: alcance.propia,
            personaId: laPersonaQueActua(user).id,
            manda: mandaEnLaCuenta(alcance.mandaEnLaPropia, alcance.elegida, alcance.propia),
        },
        cuentas: alcance.disponibles,
        puedeElegirCuenta: alcance.puedeElegir,
        cuentasRecortadas: alcance.recortadas,
    };
}

/**
 * La cuenta con la que ABRE el tablero cuando la URL no dice ninguna.
 *
 * Lo llama **solo la página**: las acciones siempre reciben la cuenta que el
 * navegador tiene delante, así que ahí no hay nada que recordar. Y no decide
 * nada por su cuenta —devuelve un id que `resolverLaCuentaDelTablero` vuelve a
 * filtrar contra las alcanzables de hoy—, así que una cuenta que se desvinculó
 * cae en la propia como cualquier `?cuenta=` rancio.
 *
 * **A quien no administra su cuenta no se le recuerda nada, y ni se pregunta.**
 * Un agente no tiene selector —ve lo suyo y nada más—, y Embudos es justamente
 * su pantalla de trabajo: una consulta por carga para devolverle siempre su
 * propia cuenta es una consulta que se paga todo el día.
 */
export async function laCuentaConLaQueAbre(user: UsuarioQueMira): Promise<string | null> {
    if (!canManageWorkspace(user)) return null;
    try {
        return await laCuentaRecordada(laPersonaQueActua(user).id, String(user.effectiveId ?? "").trim());
    } catch (error) {
        // El tablero abre igual, en la cuenta propia. Pero no es mudo: un
        // selector que deja de recordar se lee como que la función no existe.
        console.warn("[embudos] no se pudo leer la cuenta recordada", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * Apuntar dónde se está mirando, para la próxima visita.
 *
 * Va con la cuenta **ya resuelta**, nunca con la pedida: así lo que queda
 * apuntado es siempre algo que esa persona alcanza de verdad.
 *
 * Y la misma condición que al leer, dicha con lo que ya viene resuelto:
 * `manda` es falso exactamente para quien no puede elegir ninguna cuenta —a
 * otra solo se llega administrándola—, así que un agente no deja fila ninguna.
 *
 * Nunca lanza y nunca tumba la carga del tablero —lo que se pierde es una
 * comodidad, no un dato—, pero tampoco es mudo.
 */
export async function recordarLaCuentaDelTablero(quien: QuienMiraLosEmbudos): Promise<void> {
    if (!quien.manda) return;
    try {
        await recordarLaCuenta(quien.personaId, quien.propia, quien.cuentaId);
    } catch (error) {
        console.warn("[embudos] no se pudo recordar la cuenta del tablero", {
            persona: quien.personaId,
            cuenta: quien.cuentaId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Quién mira UNA conversación, por la cuenta de la propia conversación.
 *
 * Es la lectura que usan mover una tarjeta y la cabecera del chat, y **no
 * depende de que el navegador mande la cuenta correcta**: se resuelve el dueño
 * de la fila y se comprueba que esté entre los que esta persona alcanza. Antes
 * se exigía que fuera la cuenta propia, así que con el selector puesto la
 * conversación de una hija se rechazaba estando en su tablero — y en Chats, que
 * ya enseña las líneas de las hijas, la cabecera decía «no es de tu cuenta»
 * sobre una conversación perfectamente alcanzable.
 *
 * `null` = no se alcanza.
 */
export async function quienMiraEstaConversacion(
    user: UsuarioQueMira,
    cuentaDeLaConversacion: string,
): Promise<QuienMiraLosEmbudos | null> {
    const propia = String(user.effectiveId ?? "").trim();
    const dueno = String(cuentaDeLaConversacion ?? "").trim();
    if (!dueno) return null;

    const comun = {
        propia,
        personaId: laPersonaQueActua(user).id,
    };
    if (dueno === propia) {
        return { ...comun, cuentaId: dueno, manda: canManageWorkspace(user) };
    }
    const alcanza = await lasCuentasDeEmbudosQueAlcanza(user);
    if (!alcanza.includes(dueno)) return null;
    // Y encima la puerta de siempre, como en el selector: la lista solo dice
    // qué se ofrece. Solo se paga cuando la conversación es de OTRA cuenta, que
    // no es el camino de todos los días.
    if (!(await laPuertaPermiteLaCuenta(dueno))) return null;
    // A otra cuenta solo se llega administrándola.
    return { ...comun, cuentaId: dueno, manda: true };
}

/**
 * El tablero de un embudo, entero, de una vez: embudos, etapas y tarjetas.
 *
 * Lo llaman la página (primera carga) y la acción de recargar, así que la
 * regla de qué entra está escrita una sola vez.
 */
export async function elTableroDelEmbudo(
    quien: QuienMiraLosEmbudos,
    pedido?: string | null,
    asesorPedido?: unknown,
    cuentas?: {
        disponibles: CuentaDelTablero[];
        puedeElegir: boolean;
        recortadas: boolean;
    },
): Promise<TableroDeEmbudo> {
    const [todos, asignaciones] = await Promise.all([
        losEmbudosDe(quien.cuentaId),
        lasAsignacionesDe(quien.cuentaId),
    ]);

    // El equipo hace falta antes que nada: el filtro de asesor solo acepta
    // personas de ESTA cuenta, y sin esa comprobación un id de fuera acotaría
    // la consulta —o sea que preguntar por él diría si tiene algo aquí—.
    const equipo = quien.manda ? await elEquipoDe(quien.cuentaId) : [];
    const filtro: FiltroDeAsesor = quien.manda
        ? elFiltroDeAsesor(
              asesorPedido,
              equipo.map((p) => p.id),
          )
        : FILTRO_DE_TODOS;

    const embudoId = elEmbudoDelTablero(quien, pedido, filtro, asignaciones, todos);
    // Un asesor solo conoce el suyo: ni el nombre de los demás le llega.
    const embudos = quien.manda ? todos : todos.filter((e) => e.id === embudoId);

    const nombres: Record<string, string> = {};
    for (const p of equipo) nombres[p.id] = p.nombre;

    const deLaCuenta = cuentas?.disponibles.find((c) => c.id === quien.cuentaId);
    const vacio: TableroDeEmbudo = {
        embudos,
        embudoId,
        etapas: [],
        tarjetas: [],
        total: 0,
        totales: {},
        asignaciones: quien.manda ? asignaciones : {},
        equipo,
        nombres,
        manda: quien.manda,
        personaId: quien.personaId,
        cuentaId: quien.cuentaId,
        cuentaNombre: deLaCuenta?.nombre ?? "",
        esOtraCuenta: esOtraCuenta(quien.cuentaId, quien.propia),
        cuentas: cuentas?.disponibles ?? [],
        puedeElegirCuenta: cuentas?.puedeElegir ?? false,
        cuentasRecortadas: cuentas?.recortadas ?? false,
        asesor: comoParametroDeAsesor(filtro),
    };
    if (!embudoId) return vacio;

    const etapas = await lasEtapasDe([embudoId]);

    // Qué conversaciones caen aquí. **Una sola decisión**, y de ella salen las
    // dos consultas: el `where` de las tarjetas y el conteo por etapa. Ver
    // `AQuienSeMira`.
    const aQuien = aQuienSeMira(quien, filtro, quienCaeEnElEmbudo(embudoId, asignaciones, todos));
    const where = { userId: quien.cuentaId, ...SIN_GRUPOS, AND: [comoWhereDeAsesor(aQuien)] };

    const [sesiones, total, conteos] = await Promise.all([
        db.session.findMany({
            where,
            select: {
                id: true,
                pushName: true,
                customName: true,
                remoteJid: true,
                assignedAdvisorId: true,
                leadScore: true,
                updatedAt: true,
                sessionTags: { select: { tag: { select: { id: true, name: true, color: true, slug: true } } } },
                crmFollowUps: { where: { status: "PENDING" }, select: { id: true } },
            },
            orderBy: { updatedAt: "desc" },
            take: TOPE_DE_TARJETAS,
        }),
        db.session.count({ where }),
        etapas.length > 0
            ? losConteosPorEtapa({ embudoId, cuentaId: quien.cuentaId, aQuien })
            : Promise.resolve({}),
    ]);

    const posiciones = await lasPosicionesDe(
        embudoId,
        sesiones.map((s) => s.id),
    );
    const etiquetasQueVe = await lasEtiquetasQueVe(
        quien,
        sesiones.flatMap((s) => s.sessionTags.map((st) => st.tag.id)),
    );

    const tarjetas: TarjetaDeEmbudo[] = sesiones.map((s) => ({
        id: s.id,
        pushName: (s.customName ?? "").trim() || s.pushName,
        remoteJid: s.remoteJid,
        etapaId: laEtapaDeLaConversacion(posiciones[s.id], etapas) ?? "",
        asesorId: s.assignedAdvisorId ?? null,
        tags: s.sessionTags.map((st) => st.tag).filter((t) => etiquetasQueVe.has(t.id)),
        pendingFollowUps: s.crmFollowUps.length,
        leadScore: s.leadScore ?? null,
        actualizadoEn: s.updatedAt.toISOString(),
    }));

    return {
        ...vacio,
        etapas,
        tarjetas,
        total,
        totales: losTotalesPorEtapa(etapas, conteos, total),
    };
}
