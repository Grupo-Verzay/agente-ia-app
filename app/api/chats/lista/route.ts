import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
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
  /** Una entrada por linea pedida, en el mismo orden. */
  lineas: Array<{ instanceName: string; resultado: FetchChatsResult }>;
};

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => null)) as
    | { instanceNames?: unknown }
    | null;
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
  const cuentas = await getAssociatedAccountIds(user);

  const lineas = await Promise.all(
    pedidas.map(async (instanceName) => {
      const resultado = await unaLinea(instanceName, cuentas, user.id);
      return { instanceName, resultado };
    }),
  );

  return NextResponse.json({ lineas } satisfies RespuestaDeLaLista);
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
