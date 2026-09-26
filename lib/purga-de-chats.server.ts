import "server-only";

import { db } from "@/lib/db";
import { PURGAS_POR_VUELTA } from "@/lib/borrado-de-chats";
import { ensurePurgedAtColumn, hardDeleteLocalChat } from "@/lib/borrado-de-chats.server";

/**
 * La fase 2 del borrado de Chats: el historial, de fondo.
 *
 * Marcar una conversacion la saca de la bandeja —eso es la fase 1, y es lo que
 * la pantalla espera—. Borrar su historial es otra cosa y es la que tardaba:
 * sesiones, conversaciones, mensajes y el rastro del contacto en media docena de
 * tablas, con una transaccion por chat. Hacerlo para todos de golpe es lo que
 * reventaba con «Transaction API error» (ver `lib/borrado-de-chats.ts`).
 *
 * Es el mismo reparto que el borrado de una cuenta de cliente: `deleteUser`
 * apaga y marca en una transaccion corta, y `purgarCuentaEliminada` limpia
 * despues, fuera de transaccion y sin que nadie la espere.
 *
 * # La cola no es una tabla nueva
 *
 * Es la propia marca: `deletedAt` puesto y `purgedAt` en NULO significa
 * «eliminada, su historial sigue ahi». La columna ya se creo con ese sentido
 * —«dice que no queda nada que borrar», lo escribe el esquema— y su indice
 * `(userId, purgedAt)` ya existe. Una tabla aparte seria un segundo sitio donde
 * apuntar lo mismo, y el dia que uno de los dos se olvide la cola miente.
 *
 * # Es reanudable, y de eso vive
 *
 * Esta App se despliega decenas de veces al dia y corre con dos replicas, asi
 * que una promesa de fondo se pierde a mitad sin dejar rastro. La marca NO: se
 * queda escrita, asi que el barrido diario vuelve a coger la conversacion donde
 * se quedo. Exactamente lo que hace `purgarCuentasEliminadasPendientes`.
 */

export type ChatPorPurgar = {
  userId: string;
  instanceName: string;
  remoteJid: string;
};

export type ResumenDeLaPurga = {
  /** Cuantas se intentaron. */
  intentadas: number;
  /** Cuantas se purgaron de verdad. */
  purgadas: number;
  /** Cuantas ya no hacia falta tocar (una hermana suya las cubrio). */
  saltadas: number;
  /** Cuantas fallaron. Un numero distinto de cero es la señal de que mirar. */
  fallos: number;
};

/**
 * Una pausa corta entre conversaciones.
 *
 * El pool son diez conexiones por proceso y son las mismas que atienden la
 * bandeja y el chat abierto. Nadie espera esta purga, asi que soltar el turno
 * entre una y otra no cuesta nada y evita que una tanda de dos mil se coma una
 * conexion sin descanso durante minutos.
 */
const PAUSA_ENTRE_CHATS_MS = 25;

/**
 * Las que fallaron hace poco, para no atascar la cabeza de la cola.
 *
 * Sin esto, una conversacion que falla siempre se lleva un sitio de cada vuelta
 * del barrido para siempre. Vive en memoria a proposito: al reiniciar se vuelve
 * a intentar, que es lo que se quiere cuando el fallo era del proceso y no de la
 * fila.
 */
const FALLARON = new Map<string, number>();
const OLVIDAR_EL_FALLO_MS = 60 * 60 * 1000;

function llave(fila: ChatPorPurgar): string {
  return `${fila.userId}::${fila.instanceName}::${fila.remoteJid}`;
}

function falloHaceRato(fila: ChatPorPurgar): boolean {
  const cuando = FALLARON.get(llave(fila));
  if (cuando === undefined) return false;
  if (Date.now() - cuando > OLVIDAR_EL_FALLO_MS) {
    FALLARON.delete(llave(fila));
    return false;
  }
  return true;
}

const dormir = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms));

/**
 * Sigue pendiente esta fila.
 *
 * Una conversacion deja varias marcas —una por identidad del contacto—, asi que
 * la cola trae varias filas del MISMO chat y purgar una cubre a sus hermanas.
 * Preguntarlo antes de cada purga cuesta una consulta por el indice unico y
 * ahorra repetir la transaccion entera cuatro veces.
 */
async function sigueSinPurgar(fila: ChatPorPurgar): Promise<boolean> {
  const filas = await db.$queryRaw<{ n: bigint }[]>`
    SELECT 1 AS n
    FROM "ChatConversationPreference"
    WHERE "userId" = ${fila.userId}
      AND "instanceName" = ${fila.instanceName}
      AND "remoteJid" = ${fila.remoteJid}
      AND "deletedAt" IS NOT NULL
      AND "purgedAt" IS NULL
    LIMIT 1
  `;
  return filas.length > 0;
}

/**
 * Sella la marca como purgada.
 *
 * `hardDeleteLocalChat` ya lo hace por su cuenta —vuelve a marcar todas las
 * identidades con `purgedAt`, o borra las filas si la lista de esa linea sale de
 * nuestra base—, asi que esto solo entra donde la purga no pudo dejar nada
 * sellado. Sin ello la fila volveria a salir en la cola para siempre.
 */
async function sellarComoPurgada(fila: ChatPorPurgar): Promise<void> {
  await db.$executeRaw`
    UPDATE "ChatConversationPreference"
    SET "purgedAt" = NOW(), "updatedAt" = NOW()
    WHERE "userId" = ${fila.userId}
      AND "instanceName" = ${fila.instanceName}
      AND "remoteJid" = ${fila.remoteJid}
      AND "deletedAt" IS NOT NULL
      AND "purgedAt" IS NULL
  `;
}

/**
 * Purga el historial de una lista concreta de conversaciones.
 *
 * **En serie**, y no es una preferencia: el pool es de diez por proceso y cada
 * purga abre una transaccion. En paralelo es exactamente el fallo del que
 * venimos. Es la misma razon por la que `borrarUnaAUna` de
 * `lib/borrado-en-bloque.ts` va en serie.
 *
 * Cada una en su propio `try`: una conversacion rota en mitad de la lista no
 * puede dejar sin purgar a las mil novecientas de detras.
 */
export async function purgarEstosChats(filas: ChatPorPurgar[]): Promise<ResumenDeLaPurga> {
  const resumen: ResumenDeLaPurga = { intentadas: 0, purgadas: 0, saltadas: 0, fallos: 0 };
  if (filas.length === 0) return resumen;

  await ensurePurgedAtColumn();

  for (const fila of filas) {
    resumen.intentadas += 1;
    try {
      if (!(await sigueSinPurgar(fila))) {
        resumen.saltadas += 1;
        continue;
      }
      await hardDeleteLocalChat(fila.userId, fila.instanceName, fila.remoteJid);
      // Red de seguridad: si la purga no dejo nada sellado —porque nuestras
      // tablas ya no cruzan esa identidad con ninguna otra—, se sella aqui. Sin
      // esto la fila reaparece en la cola cada vuelta.
      await sellarComoPurgada(fila);
      resumen.purgadas += 1;
    } catch (error) {
      resumen.fallos += 1;
      FALLARON.set(llave(fila), Date.now());
      // Nunca mudo: una purga que no sale se ve como una base que no se limpia,
      // y eso no se parece a un error por ningun lado.
      console.warn("[chats] no se pudo purgar el historial de una conversacion", {
        userId: fila.userId,
        linea: fila.instanceName,
        remoteJid: fila.remoteJid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (PAUSA_ENTRE_CHATS_MS > 0) await dormir(PAUSA_ENTRE_CHATS_MS);
  }

  return resumen;
}

/**
 * Lo que queda por purgar, lo MAS RECIENTE primero.
 *
 * Al reves —lo mas viejo primero— la cabeza de la cola serian las marcas de
 * antes de que esta columna existiera: filas cuyo historial ya se borro en su
 * dia, asi que purgarlas no hace nada, y a cincuenta por vuelta del barrido
 * tardarian años en drenar mientras lo que alguien acaba de borrar espera
 * detras. Con las nuevas delante, lo que un despliegue se llevo a medias se
 * retoma en la vuelta siguiente y el resto drena solo, sin prisa y sin estorbar.
 *
 * Se salta la marca ANTIGUA sin linea (`instanceName = ''`): `hardDeleteLocalChat`
 * se niega a borrar sin saber de que linea es —y hace bien, sin linea el
 * `DELETE` se llevaria el historial del contacto en TODAS—, asi que meterla en
 * la cola seria un fallo garantizado en cada vuelta.
 */
export async function loQueFaltaPorPurgar(limite: number): Promise<ChatPorPurgar[]> {
  await ensurePurgedAtColumn();
  const filas = await db.$queryRaw<ChatPorPurgar[]>`
    SELECT "userId", "instanceName", "remoteJid"
    FROM "ChatConversationPreference"
    WHERE "deletedAt" IS NOT NULL
      AND "purgedAt" IS NULL
      AND "instanceName" <> ''
    ORDER BY "deletedAt" DESC
    LIMIT ${limite}
  `;
  return filas.filter((fila) => !falloHaceRato(fila));
}

/** Cuantas conversaciones borradas siguen con su historial dentro. */
export async function cuantoFaltaPorPurgar(): Promise<number> {
  await ensurePurgedAtColumn();
  const filas = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM "ChatConversationPreference"
    WHERE "deletedAt" IS NOT NULL
      AND "purgedAt" IS NULL
      AND "instanceName" <> ''
  `;
  return Number(filas[0]?.n ?? 0);
}

/**
 * El barrido: retoma lo que se quedo sin purgar.
 *
 * Cuelga del cron diario (`/api/cron/billing`), en su propio `try` como los
 * demas: un barrido que se cuelgue no puede tumbar el cobro, que es lo que de
 * verdad importa de esa vuelta.
 *
 * Y su numero ES la alarma: `pendientes` muy por encima de lo que se acaba de
 * borrar significa que la purga de fondo no esta llegando —un despliegue que la
 * corta una y otra vez, una tabla que falta—. Es la misma idea que «una linea
 * muerta no tiene filas»: el cero es el dato.
 */
export async function runPurgaDeChats(opciones?: { limite?: number }): Promise<
  ResumenDeLaPurga & { pendientes: number }
> {
  const limite = Math.max(1, Math.min(PURGAS_POR_VUELTA, opciones?.limite ?? PURGAS_POR_VUELTA));
  const filas = await loQueFaltaPorPurgar(limite);
  const resumen = await purgarEstosChats(filas);
  const pendientes = await cuantoFaltaPorPurgar();
  if (resumen.purgadas > 0 || resumen.fallos > 0) {
    console.info("[chats] barrido de purgas", { ...resumen, pendientes });
  }
  return { ...resumen, pendientes };
}

/**
 * Lanza la purga de fondo sin que nadie la espere.
 *
 * **Un solo obrero por proceso.** Sin el candado, cinco pulsaciones seguidas
 * arrancan cinco recorridos en serie a la vez —o sea cinco transacciones
 * simultaneas—, que es el fallo del que venimos por la puerta de al lado. El que
 * ya corre recoge lo que llegue despues, porque la cola se relee en cada vuelta.
 */
let obreroCorriendo: Promise<void> | null = null;

export function lanzarLaPurgaDeFondo(filas: ChatPorPurgar[]): void {
  if (filas.length === 0) return;

  if (obreroCorriendo) {
    // Ya hay uno recorriendo la cola; lo que se acaba de marcar ya esta en ella.
    console.info("[chats] la purga de fondo ya esta corriendo; se deja en la cola", {
      encoladas: filas.length,
    });
    return;
  }

  obreroCorriendo = (async () => {
    // Primero lo que se acaba de pedir, que es lo que alguien esta mirando; y
    // despues lo que quede en la cola, para no dejar a medias lo que un
    // despliegue anterior corto.
    await purgarEstosChats(filas);
    let vueltas = 0;
    // Un tope de vueltas, no un `while (true)`: una cola que no baja —porque
    // todas fallan— dejaria el obrero dando vueltas para siempre.
    while (vueltas < 40) {
      const siguientes = await loQueFaltaPorPurgar(PURGAS_POR_VUELTA);
      if (siguientes.length === 0) break;
      const resumen = await purgarEstosChats(siguientes);
      if (resumen.purgadas === 0) break;
      vueltas += 1;
    }
  })()
    .catch((error) => {
      console.error("[chats] la purga de fondo se corto", error);
    })
    .finally(() => {
      obreroCorriendo = null;
    });
}
