/**
 * El MARCO de la pantalla en las capturas de una guía pública: lo que rodea a
 * cualquier módulo —el menú de la izquierda y la barra de arriba—, sembrado
 * como el de una cuenta CLIENTE de verdad. Lo usan las semillas de todas las
 * guías (`sembrar-guia-<modulo>.mjs`): el marco es el mismo en todas las
 * pantallas, y con dos copias el día que se afine una la otra saldría con un
 * menú distinto.
 *
 * - La cuenta pasa a `user` con plan `personalizado`: la guía es para
 *   clientes, lo que decide qué menú y qué panel se ven es el rol, y ese plan
 *   no lleva ningún candado que distraiga.
 * - El menú sale de `menu-de-un-cliente.mjs`, y se borra lo que hubiera (los
 *   módulos de `sembrar-barra.mjs`) para que sea ese y nada más. Con iconos
 *   que el menú no conoce, la barra de la izquierda salía con letras
 *   recortadas.
 * - La barra de arriba lleva «Ver tutoriales» (una fila de `guideUrl` para la
 *   pantalla de la guía) y «Soporte» (una cuenta que atiende los tickets).
 *   Sin esas dos filas salía con dos botones menos que la de verdad.
 */
import { MENU_DE_UN_CLIENTE, comoFilaDeModulo } from "./menu-de-un-cliente.mjs";

/**
 * @param db     un `PrismaClient`
 * @param guia   la fila de «Ver tutoriales» de la pantalla que documenta:
 *               `{ path, title, description, url }`
 * @returns      la cuenta del cliente, ya actualizada
 */
export async function sembrarElMarco(db, guia, { email = "jefe@banco.test" } = {}) {
    const encontrado = await db.user.findUniqueOrThrow({ where: { email } });
    const dueno = await db.user.update({
        where: { id: encontrado.id },
        data: { role: "user", plan: "personalizado", name: "Mi Negocio", company: "Mi Negocio" },
    });

    await db.userNavPreference.deleteMany({});
    await db.userModule.deleteMany({});
    await db.moduleItem.deleteMany({});
    await db.module.deleteMany({});
    const base = Date.now() - 3_600_000;
    for (const m of MENU_DE_UN_CLIENTE) {
        const modulo = await db.module.create({ data: comoFilaDeModulo(m) });
        // Los apartados se ordenan por fecha de creación: cada uno con la suya,
        // o dos con el mismo instante se ordenarían por id, o sea al azar.
        for (const [i, it] of m.items.entries()) {
            await db.moduleItem.create({
                data: {
                    moduleId: modulo.id,
                    title: it.title,
                    url: it.url,
                    lockedPlans: it.lockedPlans ?? [],
                    createdAt: new Date(base + m.order * 1000 + i * 10),
                },
            });
        }
    }

    await db.guideUrl.deleteMany({ where: { path: guia.path } });
    await db.guideUrl.create({ data: guia });
    const casa = await db.user.upsert({
        where: { email: "soporte@guia.test" },
        update: {},
        create: { email: "soporte@guia.test", name: "Soporte", role: "admin", status: true, company: "Soporte" },
    });
    await db.$executeRaw`
        CREATE TABLE IF NOT EXISTS "tickets_config" (
            "id" INTEGER PRIMARY KEY,
            "destinoId" TEXT,
            "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await db.$executeRaw`
        INSERT INTO "tickets_config" ("id", "destinoId") VALUES (1, ${casa.id})
        ON CONFLICT ("id") DO UPDATE SET "destinoId" = EXCLUDED."destinoId"
    `;
    return dueno;
}

export { MENU_DE_UN_CLIENTE };
