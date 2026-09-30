/**
 * Aplica `DESCRIPCIONES_DE_LOS_TUTORIALES` sobre `GuidesUrl`. Solo toca la fila
 * cuya descripción sigue siendo la de `antes`; lo demás lo cuenta y lo deja.
 * Uso: DATABASE_URL=... node scripts/corregir-descripciones-de-tutoriales.mjs
 */
import { PrismaClient } from "@prisma/client";
import { DESCRIPCIONES_DE_LOS_TUTORIALES } from "./descripciones-de-los-tutoriales.mjs";

const db = new PrismaClient();
let cambiadas = 0;
let yaEstaban = 0;
const otras = [];
for (const { id, antes, ahora } of DESCRIPCIONES_DE_LOS_TUTORIALES) {
    const r = await db.guideUrl.updateMany({ where: { id, description: antes }, data: { description: ahora } });
    if (r.count) cambiadas += r.count;
    else if (await db.guideUrl.count({ where: { id, description: ahora } })) yaEstaban++;
    else otras.push(id);
}
console.log(JSON.stringify({ cambiadas, yaEstaban, noSeTocaron: otras }));
await db.$disconnect();
