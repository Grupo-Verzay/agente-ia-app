import "server-only";

import { db } from "@/lib/db";
import { SIN_GRUPOS } from "@/lib/conversaciones-de-grupo";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import {
    TOPE_DE_TARJETAS,
    elEmbudoQueSeAbre,
    laEtapaDeLaConversacion,
    quienCaeEnElEmbudo,
    type Embudo,
    type Etapa,
    type QuienMira,
} from "@/lib/embudos";
import { lasAsignacionesDe, lasEtapasDe, lasPosicionesDe, losEmbudosDe } from "@/lib/embudos-db";
import { lasEtiquetasQueVe } from "@/lib/personales-db";

/**
 * Quién mira los embudos y sobre qué cuenta.
 *
 * - `cuentaId` es la fila EFECTIVA (`ownerId ?? id`): es un alcance, y los
 *   embudos cuelgan de la cuenta, no de la persona.
 * - `personaId` es la PERSONA: con ella se asigna un embudo y con ella se sabe
 *   qué conversaciones son de un asesor (`Session.assignedAdvisorId` guarda
 *   personas).
 * - `manda`: dueño y administrador, con los mismos permisos.
 */
export type QuienMiraLosEmbudos = QuienMira & { cuentaId: string };

export type UsuarioQueMira = Parameters<typeof canManageWorkspace>[0] &
    Parameters<typeof laPersonaQueActua>[0] & { effectiveId: string };

export function quienMiraLosEmbudos(user: UsuarioQueMira): QuienMiraLosEmbudos {
    return {
        cuentaId: user.effectiveId,
        personaId: laPersonaQueActua(user).id,
        manda: canManageWorkspace(user),
    };
}

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
    /** persona → embudo. Solo lo ve quien manda. */
    asignaciones: Record<string, string>;
    /** El equipo de la cuenta. Solo lo ve quien manda. */
    equipo: PersonaDelEquipo[];
    /** id → nombre, para pintar el asesor de cada tarjeta. */
    nombres: Record<string, string>;
    manda: boolean;
    personaId: string;
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
 * El tablero de un embudo, entero, de una vez: embudos, etapas y tarjetas.
 *
 * Lo llaman la página (primera carga) y la acción de recargar, así que la
 * regla de qué entra está escrita una sola vez.
 */
export async function elTableroDelEmbudo(
    quien: QuienMiraLosEmbudos,
    pedido?: string | null,
): Promise<TableroDeEmbudo> {
    const [todos, asignaciones] = await Promise.all([
        losEmbudosDe(quien.cuentaId),
        lasAsignacionesDe(quien.cuentaId),
    ]);

    const embudoId = elEmbudoQueSeAbre(quien, pedido, asignaciones, todos);
    // Un asesor solo conoce el suyo: ni el nombre de los demás le llega.
    const embudos = quien.manda ? todos : todos.filter((e) => e.id === embudoId);

    const equipo = quien.manda ? await elEquipoDe(quien.cuentaId) : [];
    const vacio: TableroDeEmbudo = {
        embudos,
        embudoId,
        etapas: [],
        tarjetas: [],
        total: 0,
        asignaciones: quien.manda ? asignaciones : {},
        equipo,
        nombres: {},
        manda: quien.manda,
        personaId: quien.personaId,
    };
    if (!embudoId) return vacio;

    const etapas = await lasEtapasDe([embudoId]);

    // Qué conversaciones caen aquí. Un asesor: las suyas y nada más. Quien
    // manda: las de los asesores de este embudo, y si es el por defecto, además
    // las que no tienen asesor o lo tienen sin embudo.
    let filtroDeAsesor: Record<string, unknown>;
    if (!quien.manda) {
        filtroDeAsesor = { assignedAdvisorId: quien.personaId };
    } else {
        const { asesores, incluyeSinEmbudo, ajenos } = quienCaeEnElEmbudo(embudoId, asignaciones, todos);
        filtroDeAsesor = incluyeSinEmbudo
            ? { OR: [{ assignedAdvisorId: null }, { assignedAdvisorId: { notIn: ajenos } }] }
            : { assignedAdvisorId: { in: asesores } };
    }
    const where = { userId: quien.cuentaId, ...SIN_GRUPOS, AND: [filtroDeAsesor] };

    const [sesiones, total] = await Promise.all([
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

    const nombres: Record<string, string> = {};
    for (const p of equipo) nombres[p.id] = p.nombre;

    return { ...vacio, etapas, tarjetas, total, nombres };
}
