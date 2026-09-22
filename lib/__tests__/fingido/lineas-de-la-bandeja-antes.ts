// @ts-nocheck — se compila contra el árbol de ANTES (ver el script del banco); en este árbol esas dos funciones ya no existen, a propósito.
/**
 * La versión de ANTES de `lineas-de-la-bandeja.ts`: como armaba la página sus
 * líneas en el commit pinchado —las vinculadas bajo la cuenta Y las cuentas
 * que la vincularon a ella (`getMasterAccountInstances`)—. El banco la copia
 * encima de la otra en el árbol de antes.
 */
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLinkedAccountsInstances, getMasterAccountInstances } from "@/actions/linked-account-actions";

export async function lineasDeLaBandeja(): Promise<string[]> {
    const user = await currentUser();
    if (!user) return [];
    const propia = user.ownerId ?? user.id;
    const [suyas, linked, masters] = await Promise.all([
        db.instancia.findMany({ where: { userId: propia } }),
        getLinkedAccountsInstances(propia),
        getMasterAccountInstances(user.sessionUserId ?? user.id),
    ]);
    const esAgente = !!user.ownerId && user.advisorRole !== "administrador";
    const otras = esAgente ? [] : [
        ...(linked.success ? linked.data : []).flatMap((l) => l.instances),
        ...(masters.success ? masters.data : []).flatMap((m) => m.instances),
    ];
    return [...suyas, ...otras].map((i) => i.instanceName);
}
