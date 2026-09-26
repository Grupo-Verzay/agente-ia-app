/**
 * Lo que decide el borrado en bloque de Chats, sin tocar la base.
 *
 * # El fallo del que viene
 *
 * `bulkDeleteChatsAction` hacia `Promise.all` sobre TODOS los chats marcados, y
 * cada uno es `hardDeleteLocalChat`: tres consultas de identidades, una del
 * tipo de linea y **una transaccion** con una decena de sentencias y hasta ocho
 * upserts dentro. El pool de Prisma es de **diez conexiones por proceso**, y el
 * `maxWait` de una transaccion interactiva son **dos segundos**: pasado ese
 * plazo sin conseguir conexion, Prisma se rinde con
 *
 *     Transaction API error: Unable to start a transaction in the given time.
 *
 * Que es, literalmente, el «error de API» que se ve en pantalla. Reproducido en
 * el banco con la base local —que es rapida— hacen falta unas mil
 * conversaciones; en produccion, con la base compartida y `chat_messages` de
 * millones de filas, cada transaccion tarda mucho mas y el umbral baja a unas
 * pocas decenas. De ahi la sensacion de que **hay un tope**: no hay ningun
 * numero escrito, lo que hay es un limite de concurrencia que se cruza antes o
 * despues segun lo cargada que este la base.
 *
 * Y lo peor no es el error: `Promise.all` **se rinde con el primer rechazo**,
 * asi que la pantalla recibe «no se pudieron eliminar» y no quita ni una fila…
 * habiendo borrado de verdad varios cientos. Medido: con mil chats se borraron
 * 398 y la pantalla siguio enseñandolos todos.
 *
 * # La forma del arreglo
 *
 * La misma que el borrado de una cuenta de cliente (`deleteUser` →
 * `purgarCuentaEliminada`), que es el patron que ya funciona en esta casa:
 *
 *  - **Fase 1, lo que la pantalla espera: la marca.** Es lo que esconde el chat,
 *    y es barata: un `INSERT ... ON CONFLICT` de muchas filas por sentencia. Se
 *    hace entera y se contesta.
 *  - **Fase 2, de fondo: el historial.** Sesiones, conversaciones, mensajes y el
 *    rastro del contacto, de a uno y fuera de transaccion larga, por
 *    `hardDeleteLocalChat` —la MISMA funcion de siempre, sin una segunda copia—.
 *  - **Y un barrido** que retoma lo que un despliegue se lleve a medias.
 *
 * La cola de la fase 2 **no es una tabla nueva**: es la propia marca. La columna
 * `purgedAt` ya significa «ya no queda rastro que borrar» —lo dice el esquema—,
 * asi que `deletedAt` puesto y `purgedAt` en nulo ES la fila pendiente, y su
 * indice `(userId, purgedAt)` ya existe.
 */

import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";

/**
 * Cuantas conversaciones se marcan como maximo en una sola vuelta.
 *
 * Marcar es barato, pero no infinito: una cuenta con decenas de miles de
 * conversaciones tardaria minutos en una sola peticion y volveria el corte del
 * proxy, que es justo el fallo del que venimos. Asi que la accion marca hasta
 * aqui y **dice cuantas quedan**; quien la llama vuelve a pulsar —o repite
 * sola, con el contador a la vista—.
 *
 * Es el mismo «va a trozos» de `lib/sufijo-de-dispositivo-db.ts`.
 */
export const TOPE_POR_VUELTA = 2000;

/**
 * Cuantas filas de marca entran en una sola sentencia.
 *
 * Una conversacion son varias marcas —una por identidad del contacto—, asi que
 * dos mil conversaciones pueden ser seis mil filas. Con un upsert por fila eso
 * son seis mil idas y vueltas; con `VALUES` de quinientas, doce sentencias.
 *
 * Quinientas y no cinco mil porque cada fila lleva cuatro parametros y Postgres
 * topa en 65.535 por sentencia: con quinientas se queda en 3.500, con margen de
 * sobra si algun dia la marca gana una columna.
 */
export const MARCAS_POR_SENTENCIA = 500;

/**
 * Cuantas conversaciones purga el obrero de fondo en cada vuelta.
 *
 * Cincuenta, y **en serie**: el pool son diez conexiones por proceso y son las
 * mismas que atienden la bandeja y el chat abierto, que es lo que la gente esta
 * mirando. Nadie espera a esta purga, asi que no hay ninguna prisa que
 * justifique robarle turnos a los mensajes.
 */
export const PURGAS_POR_VUELTA = 50;

/** Lo que devuelve un borrado en bloque de Chats. */
export type ResumenDelBorradoDeChats = {
    /** Conversaciones que quedaron marcadas —o sea, fuera de la bandeja—. */
    marcadas: number;
    /** Las que se pidieron y no se pudieron situar en ninguna linea. */
    sinLinea: number;
    /** Cuantas quedan por marcar, si se llego al tope de la vuelta. */
    quedan: number;
};

/**
 * Los dos extremos de un rango de fechas escrito en la pantalla.
 *
 * `desde` vacio = desde la primera conversacion. `hasta` vacio = hasta hoy, y
 * **el dia entero**: cortar a medianoche deja fuera todo lo de hoy, que es lo
 * que la pantalla promete incluir.
 *
 * Devuelve `null` cuando el rango no puede existir —una fecha ilegible, o
 * `desde` posterior a `hasta`—. Eso NO es lo mismo que un rango abierto: sin
 * esta distincion, un «hasta» mal escrito se leeria como «todas» y se borraria
 * la cuenta entera. Es la regla de siempre: un dato que no se puede interpretar
 * no se sustituye por otro.
 */
export function limitesDelBorrado(
    desde?: string | null,
    hasta?: string | null,
): { desde: Date | null; hasta: Date | null } | null {
    const d = (desde ?? "").trim();
    const h = (hasta ?? "").trim();

    const inicio = d ? new Date(`${d}T00:00:00.000`) : null;
    const fin = h ? new Date(`${h}T23:59:59.999`) : null;

    if (inicio && Number.isNaN(inicio.getTime())) return null;
    if (fin && Number.isNaN(fin.getTime())) return null;
    if (inicio && fin && inicio.getTime() > fin.getTime()) return null;

    return { desde: inicio, hasta: fin };
}

/** Un rango sin ninguna de las dos fechas: «todas las conversaciones». */
export function esTodaLaBase(limites: { desde: Date | null; hasta: Date | null }): boolean {
    return limites.desde === null && limites.hasta === null;
}

/**
 * Una fila de nuestras tablas, de la que salen las identidades de un contacto.
 *
 * `chat_conversations` guarda las tres; `Session` guarda dos. Las dos son
 * DURABLES —a diferencia de `chat_messages`, que caduca a los 90 dias y que
 * este mismo borrado vacia—, y por eso son las que cruzan el `@lid` con el
 * numero cuando ya no queda ni un mensaje. Es la misma fuente que lee
 * `identidadesDelContacto`, resuelta para muchos contactos de una vez en vez de
 * con tres consultas por chat.
 */
export type FilaConIdentidades = {
    remoteJid: string;
    remoteJidAlt?: string | null;
    senderPn?: string | null;
};

/** Un jid de grupo. Su `senderPn` es QUIEN ESCRIBIO, no el contacto. */
function esGrupo(jid: string): boolean {
    return jid.trim().toLowerCase().endsWith("@g.us");
}

/**
 * Las identidades de cada contacto, cruzadas a partir de las filas que las
 * guardan juntas.
 *
 * Cada fila dice «estas formas son del MISMO contacto», porque asi se
 * escribieron. Se unen las de una misma fila y nada mas: **no se fabrica ningun
 * puente**. Es la misma regla que `buildWhatsAppJidCandidates` respeta a
 * proposito —de un `@lid` no se deduce un telefono, sus digitos son un id de
 * privacidad— y el motivo por el que el cruce tiene que salir de nuestras
 * tablas.
 *
 * **El `senderPn` de un grupo NO une nada.** Ahi esa columna es quien escribio
 * el ultimo mensaje, asi que unirla mezclaria el grupo con una persona y la
 * marca de borrar el grupo caeria encima de su conversacion privada. Es el mismo
 * cuidado que ya se tiene en el relleno de historial.
 */
export function agruparIdentidades(filas: FilaConIdentidades[]): Map<string, string[]> {
    // Union-find sobre las identidades: cada fila aporta las aristas entre las
    // suyas, y nunca entre dos filas distintas.
    const padre = new Map<string, string>();

    const raiz = (x: string): string => {
        let actual = x;
        while (padre.get(actual) !== undefined && padre.get(actual) !== actual) {
            actual = padre.get(actual)!;
        }
        // Compresion de camino: sin ella, una cuenta con miles de filas encadena
        // recorridos cada vez mas largos.
        let recorre = x;
        while (padre.get(recorre) !== undefined && padre.get(recorre) !== recorre) {
            const siguiente = padre.get(recorre)!;
            padre.set(recorre, actual);
            recorre = siguiente;
        }
        return actual;
    };

    const unir = (a: string, b: string) => {
        if (!padre.has(a)) padre.set(a, a);
        if (!padre.has(b)) padre.set(b, b);
        const ra = raiz(a);
        const rb = raiz(b);
        if (ra !== rb) padre.set(rb, ra);
    };

    for (const fila of filas) {
        const principal = (fila.remoteJid ?? "").trim();
        if (!principal) continue;
        const extras = [fila.remoteJidAlt, esGrupo(principal) ? null : fila.senderPn]
            .map((v) => (v ?? "").trim())
            .filter(Boolean);
        const formas = buildWhatsAppJidCandidates(principal, extras);
        if (!padre.has(principal)) padre.set(principal, principal);
        for (const forma of formas) unir(principal, forma);
    }

    // De las raices a los grupos, y de cada identidad a su grupo entero.
    const porRaiz = new Map<string, Set<string>>();
    for (const identidad of Array.from(padre.keys())) {
        const r = raiz(identidad);
        const grupo = porRaiz.get(r) ?? new Set<string>();
        grupo.add(identidad);
        porRaiz.set(r, grupo);
    }

    const porIdentidad = new Map<string, string[]>();
    for (const grupo of Array.from(porRaiz.values())) {
        const lista = Array.from(grupo);
        for (const identidad of lista) porIdentidad.set(identidad, lista);
    }
    return porIdentidad;
}

/**
 * Las identidades bajo las que se marca un chat, con la pedida PRIMERO.
 *
 * Primero porque es la que se le devuelve a la pantalla: la fila que se acaba
 * de pulsar tiene que recibir su propia marca, no la de una hermana.
 */
export function identidadesParaMarcar(
    remoteJid: string,
    grupos: Map<string, string[]>,
    extra: string[] = [],
): string[] {
    const pedido = remoteJid.trim();
    const delGrupo = grupos.get(pedido) ?? [];
    return buildWhatsAppJidCandidates(pedido, [...delGrupo, ...extra]);
}

/** El texto del resumen, con los numeros delante y sin un «listo» a secas. */
export function comoTextoDelBorrado(resumen: ResumenDelBorradoDeChats): string {
    const { marcadas, sinLinea, quedan } = resumen;
    const partes: string[] = [];

    if (marcadas === 0) {
        partes.push("No se elimino ninguna conversacion.");
    } else {
        partes.push(
            `${marcadas} conversacion${marcadas !== 1 ? "es" : ""} eliminada${marcadas !== 1 ? "s" : ""}.`,
        );
        partes.push("Su historial se esta borrando en segundo plano.");
    }
    if (quedan > 0) {
        partes.push(`Quedan ${quedan} por eliminar: vuelve a pulsar para seguir.`);
    }
    if (sinLinea > 0) {
        partes.push(
            sinLinea === 1
                ? "Una no se pudo situar en ninguna linea y no se toco."
                : `${sinLinea} no se pudieron situar en ninguna linea y no se tocaron.`,
        );
    }
    return partes.join(" ");
}

/**
 * Entra esta conversacion en el borrado.
 *
 * Son las MISMAS tres condiciones que el dialogo de «Eliminar por fecha» ya
 * aplicaba sobre las filas cargadas; lo unico que cambia es que ahora se aplican
 * sobre la bandeja entera, en el servidor. Asi el numero que se promete y lo que
 * se borra salen del mismo sitio.
 *
 *  - **Anclada, no.** Anclar es justo decir «esta me importa».
 *  - **Ya eliminada, no.** No hay nada que volver a eliminar.
 *  - **Con rango**, tiene que tener fecha y caer dentro. Sin fecha no se puede
 *    afirmar que sea vieja, asi que se queda fuera.
 *  - **Sin rango** —«todas»— entra igual sin fecha: una conversacion sin marca
 *    de tiempo sigue siendo una conversacion, y quien pide todas las pide todas.
 *
 * `segundos` se llama asi a proposito: la bandeja trabaja en SEGUNDOS
 * (`lastMessage.messageTimestamp`) y los limites son `Date`. Comparar sin
 * convertir es el fallo que este repositorio ya pago una noche entera.
 */
export function entraEnElBorrado(
    chat: { segundos: number },
    marca: { isPinned?: boolean; isDeleted?: boolean } | undefined,
    limites: { desde: Date | null; hasta: Date | null },
): boolean {
    if (marca?.isPinned) return false;
    if (marca?.isDeleted) return false;

    if (esTodaLaBase(limites)) return true;

    const ms = (chat.segundos ?? 0) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) return false;
    if (limites.desde && ms < limites.desde.getTime()) return false;
    if (limites.hasta && ms > limites.hasta.getTime()) return false;
    return true;
}

/**
 * Lo que la pantalla puede pedir que se borre.
 *
 * Nombra LINEAS, no cuentas: de quien es cada una lo resuelve el servidor, y si
 * se puede borrar ahi lo decide su puerta. Las dos fechas vacias significan
 * **todas**, que es lo que hacia falta para poder limpiar la base entera.
 *
 * Vive aqui —en el modulo puro— y no en el fichero de acciones porque lo nombran
 * las dos puntas: el dialogo que lo arma y la accion que lo recibe. Con el tipo
 * escrito en cada lado, el dia que gane un campo una de las dos se queda atras.
 */
export type CriterioDeBorrado = {
    lineas: string[];
    desde?: string;
    hasta?: string;
};

export type CuantasParaBorrar = {
    /** Cuantas entran en total. Es el numero que se le promete a la persona. */
    total: number;
    /** Cuantas se llevaria una pulsacion, como mucho. */
    enEstaVuelta: number;
    /** Cuantas quedarian para la siguiente. */
    quedan: number;
    /** Lineas que se pidieron y no se alcanzan. */
    lineasFuera: string[];
};

export type LoQueSeBorro = {
    /** Cuantas quedaron fuera de la bandeja en esta vuelta. */
    borradas: number;
    /** Cuantas quedan por borrar, si se llego al tope de la vuelta. */
    quedan: number;
    /** Las identidades que se fueron, por linea: es lo que la pantalla quita ya. */
    porLinea: { instanceName: string; remoteJids: string[] }[];
};
