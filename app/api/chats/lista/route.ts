import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { responderJson } from "@/lib/responder-json";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import { anotarUnaCarga, type MedicionDeUnaCarga } from "@/lib/vigilancia-de-chats";
import { resolveInstanceOwner } from "@/lib/chat-persistence";
import { refetchChatsManualAction } from "@/actions/chat-manual-actions";
import { fetchChannelChats } from "@/actions/channel-chat-actions";
import type { FetchChatsResult } from "@/actions/chat-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * La lista de chats de TODAS las lineas de la bandeja, en UNA peticion.
 *
 * ## Por que esto no es una accion de servidor
 *
 * Next serializa TODAS las acciones de servidor de una pagina: una en vuelo, y
 * la siguiente no arranca hasta que la anterior resuelve
 * (`shared/lib/router/action-queue.js`). Con una accion por linea, el
 * `Promise.allSettled` de la bandeja no las paralelizaba: las encolaba. Medido
 * con cuatro lineas, 1.150 ms de trabajo repartidos en once segundos de reloj.
 *
 * ## Y por que UNA peticion y no cuatro
 *
 * Sacarlas de la cola arreglo la espera, pero dejo cuatro peticiones haciendo
 * cada una el mismo trabajo de entrada: `currentUser()` y
 * `getAssociatedAccountIds()`. Medido despues: 470 a 862 ms por linea, unos
 * 2,5 s sumados, solo en averiguar cuatro veces quien pregunta.
 *
 * `currentUser()` ya esta memoizado con `cache()` de React, pero eso deduplica
 * **dentro de una peticion**, no entre peticiones. La forma de que corra una
 * sola vez es que haya una sola peticion.
 *
 * Asi que las lineas llegan juntas y se resuelven juntas: el acceso y el
 * alcance se calculan **una vez**, y las lineas se piden en paralelo dentro del
 * mismo proceso. De paso baja la concurrencia contra Postgres, que con cuatro
 * peticiones simultaneas por pestaña se multiplicaba por cada asesor conectado.
 *
 * ## Que recibe, y que NO recibe
 *
 * Solo **nombres de linea**. La clave de Evolution no viaja ni de ida ni de
 * vuelta: la resuelve el servidor con `resolverContexto`.
 *
 * ## La puerta va AQUI, y por cada linea
 *
 * `refetchChatsManualAction` ya se defiende sola, pero `fetchChannelChats` —la
 * de Meta y Telegram— lee por el `userId` de la propia linea sin preguntar
 * nada. Atada a una accion con el nombre ya puesto eso no se notaba; abierta
 * por una ruta que acepta nombres, seria la bandeja de cualquier cuenta a quien
 * supiera el nombre de su linea.
 *
 * El alcance es `getAssociatedAccountIds`: el mismo con el que la bandeja LEE
 * los chats, no el de rol. Se calcula una vez y se comprueba linea por linea —
 * juntar las peticiones no puede aflojar la puerta—. Un rechazo **se dice** en
 * la consola del contenedor en vez de contestar una lista vacia.
 *
 * ## Y la sesion se comprueba aqui
 *
 * Ninguna ruta `/api` confia solo en el middleware (ver CLAUDE.md): se pudo
 * saltar con la CVE-2025-29927 y volvera a poder.
 */

/** Tope de lineas por peticion. Una bandeja de verdad no pasa de unas pocas. */
const TOPE_DE_LINEAS = 40;

export type RespuestaDeLaLista = {
  /**
   * Una entrada por linea pedida, en el mismo orden.
   *
   * `empezoEnMs` y `acaboEnMs` son instrumentacion: milisegundos desde que
   * arranco la peticion. Viajan tambien al navegador para que el aviso de la
   * consola pueda cruzarlos con lo que el mide por fuera, sin tener que pedir
   * los registros del contenedor.
   */
  lineas: Array<{
    instanceName: string;
    resultado: FetchChatsResult;
    empezoEnMs?: number;
    acaboEnMs?: number;
  }>;
};

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => null)) as
    | { instanceNames?: unknown; medicionDeLaCarga?: unknown }
    | null;

  // La medicion de la carga anterior viaja de gorra en esta peticion, que sale
  // igualmente: asi una carga normal no cuesta ni una peticion de mas.
  //
  // `void` a proposito, y con su propio `catch`: **la vigilancia no puede hacer
  // esperar a la pantalla que vigila**, ni tumbarla. Lo unico que puede pasar
  // si esto falla es que falte una fila, y `anotarUnaCarga` ya lo avisa.
  if (cuerpo?.medicionDeLaCarga) {
    void anotarUnaCarga(
      user.ownerId ?? user.id,
      cuerpo.medicionDeLaCarga as MedicionDeUnaCarga,
    ).catch(() => {});
  }
  const pedidas = Array.isArray(cuerpo?.instanceNames)
    ? cuerpo!.instanceNames
        .filter((n): n is string => typeof n === "string")
        .map((n) => n.trim())
        .filter(Boolean)
        .slice(0, TOPE_DE_LINEAS)
    : [];

  if (!pedidas.length) {
    return NextResponse.json(
      { success: false, message: "No se pidio ninguna linea." },
      { status: 400 },
    );
  }

  // Una vez, no una por linea. Es el motivo entero de que esto sea una sola
  // peticion.
  const arrancoLaPeticion = Date.now();
  const cuentas = await getAssociatedAccountIds(user);
  const trasElAcceso = Date.now() - arrancoLaPeticion;

  /**
   * CUANDO empieza cada linea, no solo cuanto tarda.
   *
   * Una duracion sola no distingue dos cosas que se ven igual desde fuera:
   *
   * - Las cuatro arrancan juntas y el trabajo pesado -parsear el JSON de la
   *   bandeja- se las come una detras de otra, porque el hilo es de uno solo.
   * - Las cuatro van en serie de verdad, y entonces `Promise.all` no esta
   *   paralelizando nada y hay algo que las encadena.
   *
   * Medido en produccion, los cuatro `total` sumaban 2.225 ms y la peticion
   * entera 2.227: si fueran paralelas, la ultima habria medido 2.227, no 596.
   * Y a la vez los cuatro `acceso` salian casi identicos (65/68/72/67), que es
   * lo que se espera de cuatro `await` sobre UNA promesa compartida.
   *
   * Las dos lecturas encajan con esos numeros, asi que hace falta el dato que
   * si las separa: **los milisegundos desde que arranco la peticion** hasta que
   * cada linea empieza.
   *
   *   0, 0, 0, 0            -> arrancan juntas. El cuello es CPU, no la cola.
   *   0, 556, 1112, 1668    -> van en serie. Buscar que las encadena.
   */
  const lineas = await Promise.all(
    pedidas.map(async (instanceName) => {
      const empezoEnMs = Date.now() - arrancoLaPeticion;
      const resultado = await unaLinea(instanceName, cuentas, user.id);
      const acaboEnMs = Date.now() - arrancoLaPeticion;
      return { instanceName, resultado, empezoEnMs, acaboEnMs };
    }),
  );

  console.info("[chats] las lineas de una vuelta de la lista", {
    trasElAcceso,
    totalMs: Date.now() - arrancoLaPeticion,
    // Si todos los `empezoEnMs` son ~0, arrancan juntas.
    lineas: lineas.map((l) => ({
      linea: l.instanceName,
      empezoEnMs: l.empezoEnMs,
      acaboEnMs: l.acaboEnMs,
      servidor: l.resultado.tiempos ?? "(sin medir)",
    })),
  });

  quizaPesarLaRespuesta(lineas);

  // Comprimida: ver `lib/responder-json.ts`. Esta respuesta llego a pesar
  // 753 kB en crudo y sale cada 20 segundos por pestaña.
  return responderJson(request, { lineas } satisfies RespuestaDeLaLista);
}

/** Una sola vez por arranque del contenedor: pesar cuesta otro `stringify`. */
let yaSePeso = false;

/**
 * DE QUE es el peso de esta respuesta, no solo cuanto pesa.
 *
 * El navegador ya dice el total (939 KB sin comprimir para cuatro lineas, cada
 * 20 segundos). Lo que no dice es que parte de cada fila lo llena, y sin eso
 * adelgazar es adivinar: se recorta un campo, baja poco, y no se sabe si el
 * siguiente candidato vale la pena o el problema esta en otro sitio.
 *
 * Asi que se pesa la respuesta entera y, por separado, el trozo `message` de
 * cada ultimo mensaje —el unico que quedo sin recortar a proposito, porque
 * hacerlo por lista de tipos deja previsualizaciones en blanco sin un solo
 * error—. Con `porMensajeKb` al lado del total se decide con el numero delante.
 *
 * Corre UNA vez por arranque: `JSON.stringify` de esto no es gratis y esta
 * respuesta sale cada 20 segundos por pestaña.
 */
function quizaPesarLaRespuesta(lineas: RespuestaDeLaLista["lineas"]): void {
  if (yaSePeso) return;
  yaSePeso = true;
  try {
    const kb = (valor: unknown) => Math.round(JSON.stringify(valor ?? null).length / 1024);
    let chats = 0;
    let porMensajeKb = 0;
    for (const l of lineas) {
      if (!l.resultado.success) continue;
      for (const chat of l.resultado.data) {
        chats += 1;
        if (chat.lastMessage?.message) porMensajeKb += kb(chat.lastMessage.message);
      }
    }
    console.info("[chats] de que es el peso de la lista", {
      totalKb: kb(lineas),
      chats,
      porMensajeKb,
      // Lo que queda fuera de `message`: la fila, la clave y los alias.
      elRestoKb: Math.max(0, kb(lineas) - porMensajeKb),
    });
  } catch {
    // Medir no puede romper una vuelta de la lista.
  }
}

async function unaLinea(
  instanceName: string,
  cuentas: string[],
  quienPregunta: string,
): Promise<FetchChatsResult> {
  const dueno = await resolveInstanceOwner(instanceName);
  if (!dueno?.userId) {
    return { success: false, message: `La linea ${instanceName} no existe.` };
  }

  if (!cuentas.includes(dueno.userId)) {
    console.warn("[chats] se pidio la lista de una linea que no es de estas cuentas", {
      instanceName,
      quienPregunta,
    });
    return { success: false, message: `La linea ${instanceName} no es de esta cuenta.` };
  }

  const tipo = (dueno.instanceType ?? "").trim().toLowerCase();

  // Meta y Telegram viven en el store unificado y tienen su propia consulta.
  // Es el mismo reparto que hace `chats/page.tsx` al armar los juegos de
  // acciones; mandarlas por la generica las dejaria con la bandeja vacia.
  if (tipo === "meta" || tipo === "telegram") {
    return fetchChannelChats(instanceName);
  }

  // `apiKeyData: null` a proposito: que la resuelva el servidor. Es la misma
  // forma con la que ya se llamaba esta accion para las lineas cuya clave no se
  // resolvia en la pagina (`lineasEvolutionSinPlan` en chats/page.tsx).
  return refetchChatsManualAction({ apiKeyData: null, instanceName });
}
