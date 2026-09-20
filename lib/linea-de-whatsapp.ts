import { db } from "@/lib/db";

/**
 * Cuál es **la línea de WhatsApp por QR** de una cuenta, y —cuando no hay
 * ninguna— qué es exactamente lo que falta.
 *
 * # Qué pasaba
 *
 * En Perfil → Conexión, el diálogo «Asistente de voz IA» guardaba la voz y el
 * número de transferencia y contestaba **«No tienes una cuenta de WhatsApp
 * vinculada»** con la línea de esa misma cuenta ahí arriba, en la misma
 * pantalla, diciendo **Conectado** — y con el proveedor de llamadas
 * reportándola conectada también. Desvincular y volver a vincular no lo
 * arreglaba, y no podía: desvincular toca la sesión de llamadas
 * (`User.astra_calls_sid`), que no es lo que esa acción estaba mirando.
 *
 * Lo que miraba era esto:
 *
 * ```ts
 * db.instancia.findFirst({ where: { userId, instanceType: { in: ['Whatsapp', 'whatsapp'] } } })
 * ```
 *
 * Y la línea por QR se guarda con **tres formas distintas de la MISMA cosa**:
 *
 * | `instanceType` | cuándo |
 * | --- | --- |
 * | `Whatsapp` | nació en Evolution |
 * | `waha` | nació en WhatsApp Mensajería, **que es como nacen hoy las nuevas**, o se pasó a ella |
 * | `NULL` | líneas antiguas, de cuando la columna no se escribía |
 *
 * Medido en producción, solo lectura: de las **31** cuentas con línea por QR,
 * **10 la tienen en `waha`** y ese filtro no ve ni una. Cruzado con quien tiene
 * además número de llamadas vinculado, son **5 de 8** — Carlos | Arcos,
 * Verzay | Notificaciones, Verzay | Atencion, Horeca Soluciones y
 * Verzay | Ventas—, o sea la mayoría de las cuentas que pueden llegar a abrir
 * ese diálogo.
 *
 * Y una de ellas, Verzay | Ventas, **ya tiene la configuración del voicebot
 * guardada sobre su fila de `waha`**: se escribió cuando esa línea era de
 * Evolution y al cambiar de proveedor —que cambia el `instanceType` de la MISMA
 * fila, conservando todo lo demás— dejó de encontrarse. Desde entonces leerla
 * devuelve los valores por defecto y guardarla falla. Es exactamente el síntoma
 * reportado: funcionaba, dejó de funcionar, y no hay forma de arreglarlo desde
 * la pantalla.
 *
 * # La regla
 *
 * > **La línea por QR se busca por las TRES formas, y quien decide es una sola
 * > función.** Es la misma regla que este documento ya tiene escrita dos veces
 * > —*una línea es UNA instancia; el proveedor es un ajuste suyo* y *el
 * > proveedor sale de la FILA, no del parámetro*— aplicada a la pregunta de
 * > antes: no «¿qué proveedor tiene?», sino «¿la tiene?».
 *
 * # Y se filtra en TypeScript, no con un `in` de casings
 *
 * El `in` de Prisma distingue mayúsculas, así que una lista de tipos es una
 * lista de **cómo se escribieron**, y basta con que un camino guarde `WhatsApp`
 * para que se caiga sin decirlo. Se traen las instancias de la cuenta —son una
 * o dos, tres en la que más— y las filtra {@link esLineaDeWhatsappQr}, que es
 * pura. Así la consulta y la regla **no pueden discrepar**, porque son la
 * misma.
 *
 * De paso sale gratis lo otro que hacía falta: con la lista delante se puede
 * decir **qué canales sí tiene** la cuenta, que es la diferencia entre «no
 * tienes nada conectado» y «tienes Meta, pero el asistente de voz va sobre la
 * línea por QR».
 */

/** Lo mínimo que hace falta saber de una fila de `Instancias`. */
export type LineaDeLaCuenta = {
    id: number;
    instanceName: string;
    instanceType: string | null;
    instanceId: string;
    voicebotEnabled: boolean;
    voicebotVoice: string | null;
    voicebotTransferTo: string | null;
    voicebotPrompt: string | null;
};

/**
 * ¿Esta fila es la línea de WhatsApp por QR?
 *
 * Pura, y es **la** regla: la consulta se apoya en ella en vez de llevar su
 * propia lista.
 *
 * El tipo vacío cuenta como sí: las líneas antiguas se guardaron sin él, y que
 * `isWhatsappLike(null)` valga `true` desde siempre dice que la intención era
 * incluirlas. Meta, Telegram, Facebook e Instagram **no** son esto: son canales
 * de otra cosa, no un número conectado por QR.
 */
export function esLineaDeWhatsappQr(instanceType?: string | null): boolean {
    const tipo = String(instanceType ?? "").trim().toLowerCase();
    if (!tipo) return true;
    return tipo === "whatsapp" || tipo === "evolution" || tipo === "waha";
}

/** Cómo se llama cada canal en la pantalla, para poder nombrarlo en un aviso. */
const NOMBRE_DEL_CANAL: Record<string, string> = {
    meta: "WhatsApp API oficial (Meta)",
    telegram: "Telegram",
    facebook: "Facebook",
    instagram: "Instagram",
};

function nombreDelCanal(instanceType?: string | null): string {
    const tipo = String(instanceType ?? "").trim().toLowerCase();
    return NOMBRE_DEL_CANAL[tipo] ?? (tipo || "un canal sin tipo");
}

/**
 * Qué falta, con el nombre de lo que sí hay.
 *
 * Pura. Un «no tienes una cuenta de WhatsApp vinculada» a secas es el peor
 * aviso posible en esta pantalla, porque **la cuenta sí tiene WhatsApp
 * conectado** —lo dice la tarjeta de al lado— y manda a desvincular y volver a
 * vincular, que es lo que el reporte cuenta que se probó y no arregló nada. El
 * aviso tiene que nombrar la condición que falta.
 */
export function porQueNoHayLineaQr(tiposQueTiene: (string | null | undefined)[]): string {
    const otros = Array.from(
        new Set(tiposQueTiene.filter((t) => !esLineaDeWhatsappQr(t)).map(nombreDelCanal)),
    );
    if (otros.length === 0) {
        return (
            "Esta cuenta no tiene ninguna línea de WhatsApp conectada. " +
            "Conéctala en Conexión → Mensajería WhatsApp (QR): el asistente de voz se configura sobre esa línea."
        );
    }
    return (
        `Esta cuenta tiene ${otros.join(" y ")}, pero el asistente de voz va sobre la línea de ` +
        "WhatsApp por QR y esa no está conectada. Conéctala en Conexión → Mensajería WhatsApp (QR)."
    );
}

export type LaLineaDeLaCuenta = {
    /** La línea por QR, o `null` si esta cuenta no tiene ninguna. */
    linea: LineaDeLaCuenta | null;
    /** Todo lo que la cuenta tiene conectado, para poder decir qué falta. */
    todas: LineaDeLaCuenta[];
};

/**
 * La línea de WhatsApp por QR de una cuenta, sea cual sea su proveedor.
 *
 * Devuelve además **todas** sus instancias, porque quien pregunta por la línea
 * suele necesitar, si no la hay, decir qué sí hay. Es una sola consulta: una
 * cuenta tiene una o dos instancias, no cien.
 *
 * El orden es `id` ascendente **a propósito**: es el que ya usaba el voicebot,
 * así que las cuentas a las que hoy les funciona siguen escribiendo sobre la
 * misma fila. Cambiarlo movería su configuración a otra línea sin decirlo.
 */
export async function laLineaDeWhatsappDeLaCuenta(userId: string): Promise<LaLineaDeLaCuenta> {
    const todas = await db.instancia.findMany({
        where: { userId },
        orderBy: { id: "asc" },
        select: {
            id: true,
            instanceName: true,
            instanceType: true,
            instanceId: true,
            voicebotEnabled: true,
            voicebotVoice: true,
            voicebotTransferTo: true,
            voicebotPrompt: true,
        },
    });
    return { todas, linea: todas.find((i) => esLineaDeWhatsappQr(i.instanceType)) ?? null };
}
