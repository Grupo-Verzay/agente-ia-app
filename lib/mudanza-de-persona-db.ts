import "server-only";

import { db } from "@/lib/db";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import {
    type CuentaDeDestino,
    type PersonaQueSeMuda,
    type RolDeDestino,
    type SuerteDelArea,
    type Area,
    laSuerteDeCadaArea,
    losModulosQueLeQuedan,
    losModulosQueSeLeDan,
    losModulosQueSeLeQuitan,
} from "@/lib/mudanza-de-persona";

/**
 * Los dos pasos de una mudanza: **contar** y **aplicar**.
 *
 * Son dos funciones y no una con un `simular: boolean` a propósito. Un
 * parámetro que decide si se escribe es un parámetro que alguien pasa mal una
 * vez; aquí lo que no escribe **no puede** escribir, porque no tiene dentro
 * ninguna sentencia que escriba.
 *
 * Y el informe no se arma con lo que la pantalla crea: se cuenta contra la base
 * justo antes de aplicar, que es lo único que convierte «te digo lo que va a
 * pasar» en un dato.
 */

/* ──────────────────────────── Leer las filas ────────────────────────────── */

export type FilaDePersona = PersonaQueSeMuda & { nombre: string; correo: string };
export type FilaDeCuenta = CuentaDeDestino & { nombre: string; correo: string };

export async function laPersonaQueSeMuda(id: string): Promise<FilaDePersona | null> {
    const fila = await db.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, ownerId: true, advisorRole: true },
    });
    if (!fila) return null;
    return {
        id: fila.id,
        ownerId: fila.ownerId,
        advisorRole: fila.advisorRole,
        nombre: fila.name ?? "",
        correo: fila.email,
    };
}

export async function laCuentaDeDestino(id: string): Promise<FilaDeCuenta | null> {
    const fila = await db.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, company: true, ownerId: true },
    });
    if (!fila) return null;
    return {
        id: fila.id,
        ownerId: fila.ownerId,
        // El mismo criterio que `nombreDeLaCuenta`: «Empresa Demo» es el valor
        // con el que nacen todas y no distingue a ninguna.
        nombre:
            fila.company && fila.company !== "Empresa Demo"
                ? fila.company
                : fila.name || fila.email,
        correo: fila.email,
    };
}

/* ───────────────────────────── El recuento ──────────────────────────────── */

/**
 * Lo que la mudanza va a tocar y lo que va a dejar fuera de su alcance, con
 * números de la base.
 *
 * **Ninguna de estas consultas escribe.** Y las de las tablas de la App van por
 * `contar`, que devuelve `null` cuando la tabla todavía no existe: un cero ahí
 * diría «no tiene ninguno» y esto es justo lo que alguien va a leer para
 * decidir si reasigna el trabajo de una persona antes de moverla.
 */
export type Recuento = {
    /** Si las dos cuentas están unidas por `linked_accounts`. */
    mismaFamilia: boolean;
    /** Lo que se escribe. */
    cartera: number | null;
    modulosQueSeQuitan: string[];
    modulosQueSeDan: string[];
    /** Lo que viaja solo, para que se vea que no se pierde. */
    notas: number | null;
    permisosPropios: number | null;
    diasDeActividad: number | null;
    canalesDondeEsta: number | null;
    /** Lo que deja de alcanzar. */
    chatsTomados: number | null;
    tareasAbiertas: number | null;
    proyectos: number | null;
    canalesDeAreaDeAntes: number | null;
    compartidoConLaCuentaDeAntes: number | null;
};

export type Informe = {
    persona: FilaDePersona;
    origen: FilaDeCuenta | null;
    destino: FilaDeCuenta;
    rol: RolDeDestino;
    recuento: Recuento;
    areas: Record<Area, SuerteDelArea>;
};

/**
 * Un contador que no miente.
 *
 * Las tablas de la App las crea su propio módulo la primera vez que alguien las
 * usa, así que una cuenta que nunca ha abierto el chat del equipo no tiene
 * `team_channel_members`. Eso no es «cero canales»: es «no se sabe», y se
 * devuelve `null` para que el informe lo diga con esas palabras.
 */
async function contar(que: string, consulta: () => Promise<unknown>): Promise<number | null> {
    try {
        const filas = (await consulta()) as { n: bigint | number }[];
        return Number(filas?.[0]?.n ?? 0);
    } catch (error) {
        const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
        const codigo = String(e?.meta?.code ?? e?.code ?? "");
        const texto = String(e?.message ?? "");
        const noExiste = codigo === "42P01" || texto.includes("42P01");
        if (!noExiste) {
            // Un informe con un hueco se lee; uno con un cero inventado se
            // cree, y con él se muda a alguien sin reasignarle el trabajo.
            console.warn("[mudanza] no se pudo contar", { que, error: String(error) });
        }
        return null;
    }
}

export async function elRecuento(input: {
    personaId: string;
    origenId: string;
    destinoId: string;
    rol: RolDeDestino;
}): Promise<Recuento> {
    const { personaId, origenId, destinoId } = input;

    const familia = await laFamiliaDeLaCuenta(origenId);
    const mismaFamilia = familia.cuentas.includes(destinoId);

    const [suyos, delDestino] = await Promise.all([
        db.userModule
            .findMany({ where: { B: personaId }, select: { A: true } })
            .catch(() => [] as { A: string }[]),
        db.userModule
            .findMany({ where: { B: destinoId }, select: { A: true } })
            .catch(() => [] as { A: string }[]),
    ]);
    const mios = suyos.map((f) => f.A);
    const nuevos = delDestino.map((f) => f.A);

    const [
        cartera,
        notas,
        chatsTomados,
        tareasAbiertas,
        proyectos,
        permisosPropios,
        diasDeActividad,
        canalesDondeEsta,
        canalesDeAreaDeAntes,
        compartidoConLaCuentaDeAntes,
    ] = await Promise.all([
        contar(
            "cartera",
            () => db.$queryRaw`
                SELECT COUNT(*)::int AS n FROM "advisor_clients"
                WHERE "advisor_user_id" = ${personaId} AND "owner_user_id" = ${origenId}
            `,
        ),
        contar(
            "notas",
            () => db.$queryRaw`SELECT COUNT(*)::int AS n FROM "user_notes" WHERE "userId" = ${personaId}`,
        ),
        contar(
            "chats tomados",
            () => db.$queryRaw`
                SELECT COUNT(*)::int AS n FROM "Session"
                WHERE "assigned_advisor_id" = ${personaId} AND "userId" = ${origenId}
            `,
        ),
        contar(
            "tareas abiertas",
            () => db.$queryRaw`
                SELECT COUNT(*)::int AS n FROM "tasks"
                WHERE "assignedToId" = ${personaId} AND "ownerId" = ${origenId}
                  AND "status" NOT IN ('done', 'cancelled')
            `,
        ),
        contar(
            "proyectos",
            () => db.$queryRaw`
                SELECT COUNT(DISTINCT p."id")::int AS n FROM "projects" p
                LEFT JOIN "project_members" m ON m."project_id" = p."id"
                WHERE p."owner_id" = ${origenId}
                  AND (p."lead_id" = ${personaId} OR p."created_by_id" = ${personaId}
                       OR m."user_id" = ${personaId})
            `,
        ),
        contar(
            "permisos propios de documentos",
            () => db.$queryRaw`
                SELECT COUNT(*)::int AS n FROM "doc_permisos"
                WHERE "sujetoTipo" = 'persona' AND "sujetoId" = ${personaId}
            `,
        ),
        contar(
            "dias de actividad",
            () => db.$queryRaw`
                SELECT COUNT(DISTINCT "dia")::int AS n FROM "actividad_jornada"
                WHERE "personaId" = ${personaId}
            `,
        ),
        contar(
            "canales donde esta",
            () => db.$queryRaw`
                SELECT COUNT(*)::int AS n FROM "team_channel_members"
                WHERE "personaId" = ${personaId}
            `,
        ),
        contar(
            "canales de area de la cuenta de antes",
            () => db.$queryRaw`
                SELECT COUNT(*)::int AS n
                FROM "team_channel_members" m
                JOIN "team_channels" c ON c."id" = m."canalId"
                WHERE m."personaId" = ${personaId}
                  AND c."tipo" = 'area'
                  AND c."cuentaId" = ${origenId}
            `,
        ),
        contar(
            "documentos compartidos con la cuenta de antes",
            () => db.$queryRaw`
                SELECT COUNT(*)::int AS n FROM "doc_permisos"
                WHERE "sujetoTipo" = 'cuenta' AND "sujetoId" = ${origenId}
            `,
        ),
    ]);

    return {
        mismaFamilia,
        cartera,
        modulosQueSeQuitan: losModulosQueSeLeQuitan(mios, nuevos),
        modulosQueSeDan: losModulosQueSeLeDan(mios, nuevos),
        notas,
        permisosPropios,
        diasDeActividad,
        canalesDondeEsta,
        chatsTomados,
        tareasAbiertas,
        proyectos,
        canalesDeAreaDeAntes,
        compartidoConLaCuentaDeAntes,
    };
}

/** El informe entero, sin escribir una sola fila. */
export async function elInforme(input: {
    persona: FilaDePersona;
    destino: FilaDeCuenta;
    rol: RolDeDestino;
}): Promise<Informe> {
    const { persona, destino, rol } = input;
    const origenId = persona.ownerId ?? "";
    const [origen, recuento] = await Promise.all([
        origenId ? laCuentaDeDestino(origenId) : Promise.resolve(null),
        elRecuento({ personaId: persona.id, origenId, destinoId: destino.id, rol }),
    ]);
    return {
        persona,
        origen,
        destino,
        rol,
        recuento,
        areas: laSuerteDeCadaArea({ rol, mismaFamilia: recuento.mismaFamilia }),
    };
}

/* ───────────────────────────── Aplicarla ────────────────────────────────── */

export type LoQueSeHizo = {
    carteraMovida: number;
    modulosQuitados: number;
    modulosDados: number;
};

/**
 * La mudanza, en una transacción.
 *
 * **Va todo junto porque a medias miente.** Con la fila de la persona cambiada
 * y la cartera sin mover, ella alcanza clientes que en su cuenta nueva nadie
 * puede revocarle; con los módulos sin recortar, ve un módulo que su cuenta
 * nueva no tiene. Ninguno de los dos se nota mirando la pantalla.
 *
 * Y se escribe lo que se escribe **y nada más**: todo lo demás que es suyo ya
 * lleva su id, y su id no cambia. Si alguna vez hace falta tocar otra tabla
 * aquí, la pregunta que hay que contestar antes es si esa fila es **suya** o de
 * la cuenta que deja.
 */
export async function aplicarLaMudanza(input: {
    personaId: string;
    origenId: string;
    destinoId: string;
    rol: RolDeDestino;
}): Promise<LoQueSeHizo> {
    const { personaId, origenId, destinoId, rol } = input;

    return db.$transaction(async (tx) => {
        // 1. La fila de la persona. Va condicionada al origen que se vio: entre
        //    el informe y el botón alguien pudo moverla ya, y entonces esta
        //    llamada no toca nada en vez de arrastrarla desde donde no estaba.
        const movida = await tx.$executeRaw`
            UPDATE "User"
            SET "owner_id" = ${destinoId}, "advisor_role" = ${rol}
            WHERE "id" = ${personaId} AND "owner_id" = ${origenId}
        `;
        if (movida === 0) {
            throw new Error("La persona ya no cuelga de esa cuenta. Vuelve a pedir el informe.");
        }

        // 2. Su cartera. `clientesDelAsesor` solo mira `advisor_user_id`, así
        //    que sin esto seguiría funcionando… y ninguna pantalla de la cuenta
        //    nueva podría quitársela, porque Equipo acota por `owner_user_id`.
        const carteraMovida = await tx.$executeRaw`
            UPDATE "advisor_clients"
            SET "owner_user_id" = ${destinoId}
            WHERE "advisor_user_id" = ${personaId} AND "owner_user_id" = ${origenId}
        `;

        // 3. Los módulos. Ver `losModulosQueLeQuedan`: recortar a vacío le
        //    quita el TOPE, no los módulos.
        const suyos = (
            await tx.userModule.findMany({ where: { B: personaId }, select: { A: true } })
        ).map((f) => f.A);
        const nuevos = (
            await tx.userModule.findMany({ where: { B: destinoId }, select: { A: true } })
        ).map((f) => f.A);

        const quitar = losModulosQueSeLeQuitan(suyos, nuevos);
        const dar = losModulosQueSeLeDan(suyos, nuevos);

        if (quitar.length > 0) {
            await tx.userModule.deleteMany({ where: { B: personaId, A: { in: quitar } } });
        }
        if (dar.length > 0) {
            await tx.userModule.createMany({
                data: dar.map((A) => ({ A, B: personaId })),
                skipDuplicates: true,
            });
        }

        return {
            carteraMovida,
            modulosQuitados: quitar.length,
            modulosDados: dar.length,
        };
    });
}

/** Para el banco: con qué módulos se queda, leído de la base. */
export async function losModulosDe(personaId: string): Promise<string[]> {
    const filas = await db.userModule.findMany({ where: { B: personaId }, select: { A: true } });
    return filas.map((f) => f.A).sort();
}

export { losModulosQueLeQuedan };
