import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import { resolveInstanceOwner } from "@/lib/chat-persistence";
import { refetchChatsManualAction } from "@/actions/chat-manual-actions";
import { fetchChannelChats } from "@/actions/channel-chat-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * La lista de chats de UNA linea, fuera de la cola de acciones de Next.
 *
 * ## Por que esto no es una accion de servidor
 *
 * Next serializa TODAS las acciones de servidor de una pagina: una en vuelo, y
 * la siguiente no arranca hasta que la anterior resuelve
 * (`shared/lib/router/action-queue.js`). La bandeja pide la lista de cada linea
 * a la vez con un `Promise.allSettled`, pero eso no las paraleliza: las encola.
 *
 * Medido en produccion, con cuatro lineas:
 *
 * | linea                  | el servidor tardo | el navegador espero |
 * | ---------------------- | ----------------- | ------------------- |
 * | VERZAY_ATENCION        | 414 ms            | 10.213 ms           |
 * | VERZAY_VENTAS          | 179 ms            | 10.247 ms           |
 * | VERZAY_NOTIFICACIONES  | 334 ms            | 10.741 ms           |
 * | VERZAY_PRUEBAS         | 223 ms            | 11.090 ms           |
 *
 * Mil ciento cincuenta milisegundos de trabajo repartidos en once segundos de
 * reloj. Las cuatro contestaron rapido; lo que costaba era el turno. Y no es
 * solo la lista: mientras una de estas ocupa la cola, el `bootstrap` y las
 * sesiones —que pintan las insignias de cada fila— esperan detras.
 *
 * Una ruta `/api` es un `fetch` normal: no pasa por esa cola y las cuatro
 * salen de verdad a la vez.
 *
 * ## La puerta va AQUI, y antes de despachar
 *
 * Esta ruta recibe el nombre de la linea del navegador, asi que la comprueba
 * ella. Es la regla de CLAUDE.md —ninguna accion usa un id que llega de fuera
 * sin comprobar de quien es el dato— y aqui hacia falta de verdad:
 *
 * - `refetchChatsManualAction` ya se defiende sola: `resolverContexto` no
 *   entrega la clave de Evolution de una linea ajena, y el respaldo lee con
 *   las cuentas de quien pregunta.
 * - `fetchChannelChats` **no**. Lee por `owner.userId` de la propia linea, sin
 *   preguntar nada. Atada a una accion con el nombre ya puesto eso no se
 *   notaba; abierta por una ruta que acepta el nombre, seria la bandeja de
 *   Meta y Telegram de cualquier cuenta a quien supiera el nombre de su linea.
 *
 * El alcance es `getAssociatedAccountIds`: el mismo con el que la bandeja LEE
 * los chats, no el de rol. Si alguien legitimo recibiera un «No autorizado»
 * aqui, lo que esta mal es la lista de lineas que manda la pantalla, no esta
 * comprobacion —y por eso el rechazo **se dice** en la consola del contenedor
 * en vez de contestar una lista vacia—.
 *
 * ## Y la sesion se comprueba aqui
 *
 * Ninguna ruta `/api` confia solo en el middleware (ver CLAUDE.md): se pudo
 * saltar con la CVE-2025-29927 y volvera a poder.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => null)) as { instanceName?: unknown } | null;
  const instanceName =
    typeof cuerpo?.instanceName === "string" ? cuerpo.instanceName.trim() : "";
  if (!instanceName) {
    return NextResponse.json(
      { success: false, message: "Falta el nombre de la linea." },
      { status: 400 },
    );
  }

  const dueno = await resolveInstanceOwner(instanceName);
  if (!dueno?.userId) {
    return NextResponse.json(
      { success: false, message: "Esa linea no existe." },
      { status: 404 },
    );
  }

  const cuentas = await getAssociatedAccountIds(user);
  if (!cuentas.includes(dueno.userId)) {
    console.warn("[chats] se pidio la lista de una linea que no es de estas cuentas", {
      instanceName,
      quienPregunta: user.id,
    });
    return NextResponse.json(
      { success: false, message: "Esa linea no es de esta cuenta." },
      { status: 403 },
    );
  }

  const tipo = (dueno.instanceType ?? "").trim().toLowerCase();

  // Meta y Telegram viven en el store unificado y tienen su propia consulta.
  // Es el mismo reparto que hace `chats/page.tsx` al armar los juegos de
  // acciones; mandarlas por la generica las dejaria con la bandeja vacia.
  if (tipo === "meta" || tipo === "telegram") {
    return NextResponse.json(await fetchChannelChats(instanceName));
  }

  // `apiKeyData: null` a proposito: que la resuelva el servidor. Es la misma
  // forma con la que ya se llamaba esta accion para las lineas cuya clave no se
  // resolvia en la pagina (`lineasEvolutionSinPlan` en chats/page.tsx).
  return NextResponse.json(
    await refetchChatsManualAction({ apiKeyData: null, instanceName }),
  );
}
