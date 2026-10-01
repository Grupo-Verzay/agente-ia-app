/**
 * Sube al nivel de su licencia a los clientes de reseller que se quedaron POR
 * DEBAJO de ella.
 *
 * Un cliente que consume una licencia de reseller tiene que estar en el nivel
 * de esa licencia (`lib/nivel-de-la-licencia.ts`). Desde que las acciones lo
 * imponen ya no se desalinea ninguno; esto recoge los que ya estaban — el caso
 * que lo destapó fue «Asesor DAYRA», de Daniel Peralta: licencia de Nivel 6 y
 * la cuenta en Nivel 5, sin poder crear usuarios.
 *
 * Tres cosas, y las tres a propósito:
 *
 * 1. **Solo se SUBE.** Un cliente por debajo de su licencia pierde módulos que
 *    su reseller ya paga; subirlo no le quita nada. Uno por ENCIMA no se toca:
 *    bajarlo le cerraría módulos que hoy usa. Se dice, y se endereza la
 *    próxima vez que alguien guarde su ficha, con aviso.
 * 2. **Solo cuenta una licencia que EXISTE.** Un cliente con un
 *    `resellerSubscriptionPlanId` que ya no corresponde a ninguna licencia de
 *    su reseller no tiene nivel que heredar.
 * 3. **El `UPDATE` va condicionado al nivel que se vio al planear.** Si alguien
 *    lo cambió mientras tanto, no se toca. Y no se toca nada más de la fila.
 *
 * Uso (dentro del contenedor de la App, con `DATABASE_URL` puesta):
 *
 *     node subir-clientes-a-su-licencia.mjs            # solo dice qué haría
 *     node subir-clientes-a-su-licencia.mjs --aplicar  # lo hace
 *
 * Imprime antes y después para poder deshacerlo a mano.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Los niveles, de menor a mayor. Es el orden de `PLANS` y de `lib/nivel-de-la-licencia.ts`. */
export const NIVELES = ["lite", "basico", "intermedio", "avanzado", "enterprise", "personalizado"];

/**
 * El plan, puro. `filas`: `{ id, nombre, plan, nivelDeLaLicencia }`, donde
 * `nivelDeLaLicencia` es `null` si no hay licencia que lo respalde.
 */
export function laCorreccion(filas) {
    const subir = [];
    const porEncima = [];
    for (const f of filas) {
        if (!f.nivelDeLaLicencia) continue;
        const suyo = NIVELES.indexOf(f.plan);
        const deLaLicencia = NIVELES.indexOf(f.nivelDeLaLicencia);
        if (deLaLicencia < 0) continue;
        if (suyo < deLaLicencia) subir.push({ id: f.id, nombre: f.nombre, de: f.plan, a: f.nivelDeLaLicencia });
        else if (suyo > deLaLicencia) porEncima.push({ id: f.id, nombre: f.nombre, plan: f.plan, licencia: f.nivelDeLaLicencia });
    }
    return { subir, porEncima };
}

const LECTURA = `
  SELECT u.id, COALESCE(NULLIF(u.company, ''), u.name, u.email) AS nombre, u.plan::text AS plan,
         sp.plan::text AS "nivelDeLaLicencia"
  FROM "User" u
  JOIN reseller_license_pools lp
    ON lp."resellerUserId" = u.demo_reseller_id AND lp."subscriptionPlanId" = u.reseller_subscription_plan_id
  JOIN subscription_plans sp ON sp.id = lp."subscriptionPlanId"
  WHERE u.reseller_subscription_plan_id IS NOT NULL
    AND u.demo_reseller_id IS NOT NULL
    AND u.is_demo = false
    AND u."deletedAt" IS NULL
`;

export async function correr({ prisma, aplicar, log = console.log }) {
    const filas = await prisma.$queryRawUnsafe(LECTURA);
    const { subir, porEncima } = laCorreccion(filas);
    log(`[licencias] ${filas.length} cliente(s) con licencia de reseller; ${subir.length} por debajo, ${porEncima.length} por encima.`);
    for (const p of porEncima) log(`  por encima (no se toca): ${p.nombre} — ${p.plan} con licencia ${p.licencia} (${p.id})`);
    const hechos = [];
    for (const s of subir) {
        log(`  ${aplicar ? "sube" : "subiría"}: ${s.nombre} — ${s.de} → ${s.a} (${s.id})`);
        if (!aplicar) continue;
        const r = await prisma.$executeRawUnsafe(
            `UPDATE "User" SET plan = $1::"Plan", "updatedAt" = now() WHERE id = $2 AND plan = $3::"Plan"`,
            s.a,
            s.id,
            s.de,
        );
        if (r === 1) hechos.push(s);
        else log(`    no se tocó: su nivel cambió mientras tanto`);
    }
    return { subir, porEncima, hechos };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    const require = createRequire(path.join(process.cwd(), "noop.js"));
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const aplicar = process.argv.includes("--aplicar");
    try {
        const r = await correr({ prisma, aplicar });
        console.log(aplicar ? `[licencias] listo: ${r.hechos.length} subido(s).` : "[licencias] no se tocó nada (falta --aplicar).");
    } finally {
        await prisma.$disconnect();
    }
}
