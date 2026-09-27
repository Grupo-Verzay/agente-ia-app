import "server-only";

import type { ApiKey } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser, type CurrentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { rolQueManda } from "@/lib/cuenta-que-manda";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import { comoUrlDelServidor, sinLaClaveDelServidor } from "@/lib/clave-del-servidor";

/**
 * Quien LEE la clave de un servidor de WhatsApp. Vive aquí, con `server-only`,
 * y no en un fichero `'use server'`: ahí todo lo exportado es un POST que se
 * llama desde el navegador con los parámetros que uno quiera, y eso es
 * exactamente lo que era `getApiKeyById(id)` —«dame la clave de este
 * servidor»—, sin sesión y sin preguntar nada.
 *
 * Lo que devuelven estas funciones **no se reenvía al navegador**. Si una
 * pantalla necesita saber que hay servidor, va con `elServidorSinClave`.
 */

export type ClaveDelServidor = { url: string; key: string };

/**
 * La clave del servidor de una CUENTA: la suya, y si no tiene —alguien del
 * equipo— la de la cuenta de la que cuelga. Es el mismo respaldo que ya hace
 * `currentUser()` con las credenciales del dueño.
 *
 * **No comprueba quién pregunta**: quien la llama ya resolvió la cuenta con su
 * puerta (`laCuentaDeLaAccion`, la línea de una cita…). Sin esa puerta delante
 * no se llama.
 */
export async function laClaveDelServidorDeLaCuenta(cuentaId: string | null | undefined): Promise<ClaveDelServidor | null> {
    const id = String(cuentaId ?? "").trim();
    if (!id) return null;

    const fila = await db.user.findUnique({
        where: { id },
        select: { ownerId: true, apiKey: { select: { url: true, key: true } } },
    });
    let clave = fila?.apiKey?.key ? fila.apiKey : null;
    if (!clave && fila?.ownerId) {
        const dueno = await db.user.findUnique({
            where: { id: fila.ownerId },
            select: { apiKey: { select: { url: true, key: true } } },
        });
        clave = dueno?.apiKey?.key ? dueno.apiKey : null;
    }
    if (!clave?.url || !clave?.key) return null;
    return { url: comoUrlDelServidor(clave.url), key: clave.key };
}

/**
 * La clave con la que se habla con una LÍNEA, para quien la está mirando.
 *
 * La línea se busca por su nombre, su dueña sale de la FILA —nunca del
 * navegador— y se pasa por `assertCanAccessTargetUser`: la propia y lo que
 * cuelga hacia abajo, nunca la madre ni una hermana. Si no se alcanza, `null`.
 */
export async function laClaveDeLaLineaParaQuienMira(instanceName: string | null | undefined): Promise<
    (ClaveDelServidor & { userId: string; instanceName: string; instanceType: string | null }) | null
> {
    const nombre = String(instanceName ?? "").trim();
    if (!nombre) return null;

    const linea = await db.instancia.findFirst({
        where: { instanceName: nombre },
        select: { userId: true, instanceName: true, instanceType: true },
    });
    if (!linea?.userId) return null;

    try {
        await assertCanAccessTargetUser(linea.userId);
    } catch {
        console.warn("[claves] se pidió la clave de una línea que no se alcanza", { instanceName: nombre });
        return null;
    }

    const clave = await laClaveDelServidorDeLaCuenta(linea.userId);
    if (!clave) return null;
    return { ...clave, userId: linea.userId, instanceName: linea.instanceName, instanceType: linea.instanceType };
}

/**
 * Un servidor por su id, SIN la clave: lo que necesitan las pantallas que
 * enseñan «falta configurar el servidor» y nada más.
 */
export async function elServidorSinClave(id: string | null | undefined): Promise<ApiKey | null> {
    const limpio = String(id ?? "").trim();
    if (!limpio) return null;
    const servidor = await db.apiKey.findUnique({ where: { id: limpio } });
    return sinLaClaveDelServidor(servidor);
}

/**
 * La lista de servidores para ELEGIR uno (Panel › Clientes, al asignarle
 * servidor a una cuenta): el id y la dirección, nunca la clave. Esa pantalla la
 * abren administradores y resellers, y un reseller no administra servidores.
 */
export async function losServidoresSinClave(): Promise<ApiKey[]> {
    const servidores = await db.apiKey.findMany({ orderBy: { url: "asc" } });
    return servidores.map((s) => sinLaClaveDelServidor(s));
}

/**
 * ¿Administra quien mira los servidores de la plataforma? Es la MISMA puerta que
 * ya abre Panel › Conexión y el servidor de WhatsApp Mensajería
 * (`waha-server-actions`): la cuenta por la que se actúa es de la casa. Con
 * «Ingresar» puesto manda la cuenta en la que se está, que es de un cliente, así
 * que dentro de un cliente no se administra nada.
 */
export async function administraLosServidores(persona?: CurrentUser | null): Promise<boolean> {
    const user = persona === undefined ? await currentUser() : persona;
    if (!user) return false;
    return isAdminLike(await rolQueManda(user));
}
