/**
 * Las líneas que enseña la bandeja de Chats, armadas EXACTAMENTE como las arma
 * `app/(root)/chats/page.tsx` en este árbol: la propia más las de
 * `lasCuentasQueVeLaBandeja`. La página es un componente de servidor entero y
 * no se puede montar sin Next; el barrido del banco comprueba aparte que la
 * página sigue armándolas así.
 */
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { lasCuentasQueVeLaBandeja } from "@/lib/cuentas-asociadas";
import { lasLineasDeLasCuentas } from "@/lib/lineas-de-las-cuentas.server";

export async function lineasDeLaBandeja(): Promise<string[]> {
    const user = await currentUser();
    if (!user) return [];
    const propia = user.ownerId ?? user.id;
    const cuentas = await lasCuentasQueVeLaBandeja(user);
    const otras = cuentas.filter((id) => id !== propia && id !== user.sessionUserId && id !== user.id);
    const [suyas, vinculadas] = await Promise.all([
        db.instancia.findMany({ where: { userId: propia } }),
        lasLineasDeLasCuentas(otras),
    ]);
    return [...suyas.map((i) => i.instanceName), ...vinculadas.flatMap((v) => v.instances.map((i) => i.instanceName))];
}
