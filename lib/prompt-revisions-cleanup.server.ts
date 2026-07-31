import { db } from "@/lib/db";

/**
 * Cuántas revisiones se conservan de cada prompt. Mismo número que aplica el
 * publicado; aquí solo se pone al día lo que se acumuló antes de que existiera
 * esa poda.
 */
const REVISIONES_A_CONSERVAR = 20;

/**
 * Recorta el histórico de revisiones que ya estaba acumulado.
 *
 * Cada revisión guarda el prompt entero —unos 23 kB— y nunca se borraba
 * ninguna: 181 MB desde octubre, la cuarta tabla más grande de la base. Al
 * publicar ya se poda, pero eso solo alcanza a los prompts que alguien vuelva a
 * publicar; los que quedaron quietos se quedarían gordos para siempre.
 *
 * De pocos en pocos y sin transacción larga: no hay ninguna prisa y así no
 * bloquea nada.
 */
export async function podarRevisionesDePromptsPendientes(limitePrompts = 20) {
    const agrupados = await db.agentPromptRevision.groupBy({
        by: ["promptId"],
        _count: { _all: true },
        having: { promptId: { _count: { gt: REVISIONES_A_CONSERVAR } } },
        // Prisma exige un orden cuando se limita un groupBy. Da igual cuál sea:
        // lo que no entre en esta pasada entra en la siguiente.
        orderBy: { promptId: "asc" },
        take: limitePrompts,
    });

    let borradas = 0;
    for (const grupo of agrupados) {
        const sobrantes = await db.agentPromptRevision.findMany({
            where: { promptId: grupo.promptId },
            select: { id: true },
            orderBy: { revisionNumber: "desc" },
            skip: REVISIONES_A_CONSERVAR,
        });
        if (!sobrantes.length) continue;

        const res = await db.agentPromptRevision.deleteMany({
            where: { id: { in: sobrantes.map((r) => r.id) } },
        });
        borradas += res.count;
    }

    return { prompts: agrupados.length, borradas };
}
