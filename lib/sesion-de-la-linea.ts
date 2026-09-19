import { db } from "@/lib/db";
import {
    deleteWahaSession,
    getWahaSession,
    wahaSessionAction,
} from "@/lib/waha";

/**
 * Cerrar, borrar y consultar la sesión de WhatsApp de una línea, **en los dos
 * proveedores**, decidiendo por el `instanceType` de la FILA y nunca por el que
 * venga en el parámetro.
 *
 * Ese es el fallo entero, y ya mordió dos veces en el #791. Media docena de
 * funciones de `actions/api-action.ts` reciben `instanceType = 'Whatsapp'` por
 * defecto, encuentran la fila con `checkActiveInstance` —que SÍ busca en los dos
 * tipos, a propósito— y a partir de ahí deciden con el tipo **pedido**:
 *
 * ```ts
 * const instanciaActiva = await checkActiveInstance(userId, instanceType); // puede ser waha
 * if (isWhatsappLike(instanceType)) { …Evolution… }                        // pregunta por 'Whatsapp'
 * const fila = await db.instancia.findFirst({ where: { instanceName, instanceType } }); // ya no la encuentra
 * ```
 *
 * De ahí salen los dos daños que se midieron:
 *
 * - **Se habla con el servidor equivocado.** Un `logout` de Evolution contra el
 *   nombre de una sesión de Waha no cierra nada y no falla de forma visible: el
 *   servidor contesta «no existe» y el código sigue como si hubiera cerrado.
 * - **Y la fila se va sin la sesión.** Borrar el registro mientras la sesión
 *   sigue viva deja una sesión huérfana ocupando sitio en el servidor de Waha
 *   **para siempre**, porque ya no queda ninguna fila que diga que existe. Es lo
 *   que pasaba al eliminar una cuenta morosa a los 30 días.
 *
 * Así que las tres operaciones viven aquí, se les pasa la fila entera y ellas
 * eligen el proveedor. Con la condición escrita en cada sitio, el séptimo se
 * olvida — que es literalmente lo que ya pasó.
 */

export type Proveedor = "evolution" | "waha" | "otro";

export type LineaParaLaSesion = {
    instanceName: string;
    instanceType?: string | null;
    /** De quién es la línea, para resolver la ApiKey de Evolution. */
    userId: string;
};

/**
 * Qué hay detrás de esta fila.
 *
 * `Whatsapp` y el tipo vacío son Evolution —las líneas antiguas se guardaron sin
 * tipo—; `waha` es WhatsApp Mensajería. Todo lo demás (Meta, Telegram, Facebook,
 * Instagram) **no tiene sesión de WhatsApp que cerrar**, y eso no es un caso
 * raro: son la mitad de los canales de la plataforma.
 */
export function proveedorDeLaFila(instanceType?: string | null): Proveedor {
    const tipo = String(instanceType ?? "").trim().toLowerCase();
    if (tipo === "waha") return "waha";
    if (!tipo || tipo === "whatsapp" || tipo === "evolution") return "evolution";
    return "otro";
}

/** La url se guarda unas veces con esquema y otras sin él. */
export function comoUrlDeEvolution(url?: string | null): string {
    const valor = String(url ?? "").trim().replace(/\/+$/, "");
    if (!valor) return "";
    return /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
}

async function credencialesDeEvolution(userId: string) {
    const user = await db.user.findUnique({
        where: { id: userId },
        include: { apiKey: true },
    });
    const base = comoUrlDeEvolution(user?.apiKey?.url);
    const key = user?.apiKey?.key?.trim();
    if (!base || !key) return null;
    return { base, key };
}

/**
 * Cierra la sesión (desvincula el teléfono) **sin borrar nada**.
 *
 * Un fallo aquí NO se traga: si el proveedor no acepta el logout, el teléfono
 * sigue vinculado y hay que decirlo. Tragárselo deja una tarjeta que dice
 * «sesión cerrada» con la sesión abierta.
 */
export async function cerrarLaSesionDeLaLinea(
    linea: LineaParaLaSesion,
): Promise<{ ok: boolean; message: string }> {
    const proveedor = proveedorDeLaFila(linea.instanceType);

    if (proveedor === "otro") {
        return { ok: true, message: "Este canal no tiene una sesión de WhatsApp que cerrar." };
    }

    if (proveedor === "waha") {
        const res = await wahaSessionAction(linea.instanceName, "logout");
        if (!res.ok) {
            console.warn("[linea] no se pudo cerrar la sesion en WhatsApp Mensajeria", {
                instanceName: linea.instanceName,
                motivo: res.message,
            });
            return { ok: false, message: res.message ?? "No se pudo cerrar la sesión." };
        }
        return { ok: true, message: "Sesión cerrada. Escanea el QR para volver a conectar." };
    }

    const cred = await credencialesDeEvolution(linea.userId);
    if (!cred) {
        return { ok: false, message: "El usuario no tiene una ApiKey de Evolution asignada." };
    }

    const resp = await fetch(
        `${cred.base}/instance/logout/${encodeURIComponent(linea.instanceName)}`,
        { method: "DELETE", headers: { apikey: cred.key, "Content-Type": "application/json" } },
    ).catch(() => null);

    if (!resp?.ok) {
        console.warn("[linea] Evolution no acepto el logout", {
            instanceName: linea.instanceName,
            estado: resp?.status ?? "sin respuesta",
        });
        return { ok: false, message: "Evolution no aceptó cerrar la sesión. Inténtalo de nuevo." };
    }

    return { ok: true, message: "Sesión cerrada. Escanea el QR para volver a conectar." };
}

/**
 * Cierra **y borra** la sesión en el servidor del proveedor. No toca la fila:
 * de eso se encarga quien llama, que es el único que sabe si además hay que
 * borrar el registro o conservarlo.
 *
 * `transitorio` es la distinción que importa: un servidor caído o un `5xx` es
 * de hoy y se puede reintentar, así que **la fila se conserva** como señal de
 * borrado pendiente; un `404` o un `4xx` es firme —la sesión ya no está— y la
 * fila se puede ir. Borrar la fila ante un fallo transitorio es exactamente
 * cómo se queda una sesión huérfana.
 */
export async function borrarLaSesionDeLaLinea(
    linea: LineaParaLaSesion,
): Promise<{ ok: boolean; transitorio: boolean; message: string }> {
    const proveedor = proveedorDeLaFila(linea.instanceType);

    if (proveedor === "otro") {
        return { ok: true, transitorio: false, message: "Sin sesión de WhatsApp que borrar." };
    }

    if (proveedor === "waha") {
        // El logout va primero y es best-effort: borrar la sesión ya la cierra,
        // pero si el borrado falla queremos al menos haber desvinculado.
        await wahaSessionAction(linea.instanceName, "logout").catch(() => null);
        const res = await deleteWahaSession(linea.instanceName);
        if (!res.ok) {
            // `deleteWahaSession` ya da por bueno un 404, así que llegar aquí es
            // que el servidor no contestó o contestó mal: transitorio.
            return {
                ok: false,
                transitorio: true,
                message: res.message ?? "WhatsApp Mensajería no confirmó el borrado. Se reintentará.",
            };
        }
        return { ok: true, transitorio: false, message: "Sesión eliminada en WhatsApp Mensajería." };
    }

    const cred = await credencialesDeEvolution(linea.userId);
    if (!cred) {
        // Sin ApiKey no se puede contactar con Evolution, y eso no es un fallo
        // transitorio: no va a aparecer una clave sola. Quien llama decide si se
        // queda con la fila o la limpia.
        return {
            ok: false,
            transitorio: false,
            message: "El usuario no tiene una ApiKey de Evolution asignada.",
        };
    }

    // logout best-effort: no condiciona el resultado.
    await fetch(`${cred.base}/instance/logout/${encodeURIComponent(linea.instanceName)}`, {
        method: "DELETE",
        headers: { apikey: cred.key, "Content-Type": "application/json" },
    }).catch(() => null);

    let alcanzado = false;
    let estado = 0;
    try {
        const res = await fetch(
            `${cred.base}/instance/delete/${encodeURIComponent(linea.instanceName)}`,
            { method: "DELETE", headers: { apikey: cred.key, "Content-Type": "application/json" } },
        );
        alcanzado = true;
        estado = res.status;
    } catch {
        alcanzado = false;
    }

    if (!alcanzado || estado >= 500) {
        return {
            ok: false,
            transitorio: true,
            message: `Evolution no confirmó el borrado (${alcanzado ? `status=${estado}` : "sin respuesta"}). Se reintentará.`,
        };
    }

    return { ok: true, transitorio: false, message: "Instancia eliminada en Evolution." };
}

/**
 * Libera **todas** las sesiones de WhatsApp de una cuenta que se va a eliminar.
 *
 * Los dos caminos de borrado a los 30 días llamaban a funciones que resuelven la
 * línea con `checkActiveInstance`, que es un `findFirst`: **una sola**. Una
 * cuenta con dos líneas —lo normal en cuanto alguien separa Ventas de
 * Atención— dejaba la segunda sin tocar. Y da igual que la fila se fuera: la
 * relación es `onDelete: Cascade`, así que borrar la cuenta se lleva TODAS sus
 * filas de `Instancias` por delante, con sesión liberada o sin ella. Lo que
 * queda al otro lado no lo va a reclamar nadie, porque ya no existe la fila que
 * decía de quién era.
 *
 * Por eso esto va **antes** de `db.user.delete` y recorre la lista entera.
 * Nunca lanza: una sesión que no se pudo cerrar no puede impedir que se elimine
 * la cuenta. Pero **no es mudo**, que es lo único que hace visible una sesión
 * huérfana.
 */
export async function liberarLasLineasDeLaCuenta(userId: string): Promise<{
    liberadas: number;
    fallidas: number;
}> {
    let liberadas = 0;
    let fallidas = 0;

    try {
        const filas = await db.instancia.findMany({
            where: { userId },
            select: { instanceName: true, instanceType: true },
        });

        for (const fila of filas) {
            if (!fila.instanceName) continue;
            if (proveedorDeLaFila(fila.instanceType) === "otro") continue;

            const res = await borrarLaSesionDeLaLinea({
                instanceName: fila.instanceName,
                instanceType: fila.instanceType,
                userId,
            }).catch((error: unknown) => ({
                ok: false,
                transitorio: true,
                message: (error as Error)?.message ?? "Error inesperado.",
            }));

            if (res.ok) {
                liberadas += 1;
            } else {
                fallidas += 1;
                console.warn("[linea] sesion sin liberar al eliminar la cuenta", {
                    userId,
                    instanceName: fila.instanceName,
                    instanceType: fila.instanceType,
                    motivo: res.message,
                });
            }
        }
    } catch (error) {
        console.warn("[linea] no se pudieron leer las lineas de la cuenta que se elimina", {
            userId,
            motivo: (error as Error)?.message,
        });
    }

    return { liberadas, fallidas };
}

/**
 * Si la línea está conectada ahora mismo.
 *
 * Los tres valores no son intercambiables y por eso no devuelve un booleano:
 * **`desconocido` no es «caída»**. Una línea cuyo servidor no contesta, o de un
 * canal que no se puede consultar desde aquí, no se pinta en rojo ni se avisa
 * de ella — inventar un estado es lo que llenaba la lista de clientes a los que
 * escribirle sin motivo.
 */
export type EstadoDeLaSesion = "conectada" | "caida" | "desconocido";

export async function estadoDeLaSesionDeLaLinea(
    linea: LineaParaLaSesion,
    credencialesEvolution?: { base: string; key: string } | null,
): Promise<EstadoDeLaSesion> {
    const proveedor = proveedorDeLaFila(linea.instanceType);
    if (proveedor === "otro") return "desconocido";

    if (proveedor === "waha") {
        const sesion = await getWahaSession(linea.instanceName).catch(() => null);
        if (!sesion) return "desconocido";
        return sesion.status === "WORKING" ? "conectada" : "caida";
    }

    // Las credenciales se pueden pasar ya resueltas: quien recorre muchas líneas
    // de la misma cuenta no tiene por qué leer la misma ApiKey una vez por línea
    // («muchas peticiones pequeñas son turno, no trabajo», por dentro).
    const cred = credencialesEvolution ?? (await credencialesDeEvolution(linea.userId));
    if (!cred) return "desconocido";

    try {
        const res = await fetch(
            `${cred.base}/instance/connectionState/${encodeURIComponent(linea.instanceName)}`,
            {
                method: "GET",
                headers: { apikey: cred.key },
                cache: "no-store",
                signal: AbortSignal.timeout(8000),
            },
        );
        if (!res.ok) return "desconocido";
        const data = await res.json().catch(() => null);
        const estado = data?.instance?.state ?? data?.state ?? data?.connectionState;
        return String(estado ?? "").trim().toLowerCase() === "open" ? "conectada" : "caida";
    } catch {
        return "desconocido";
    }
}
