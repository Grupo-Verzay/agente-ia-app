import "server-only";

import { db } from "@/lib/db";
import { contarChatsSinLeer } from "@/lib/chat-persistence";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";

/**
 * Cuántos chats de clientes esperan respuesta, para el número de la pestaña.
 *
 * # Por qué es `server-only` y no una acción
 *
 * Porque no tiene pantalla detrás: lo pide **el reloj del contador**, que ya va
 * al servidor cada quince segundos, y de ahí sale este número pegado al del
 * equipo. Dejarlo en un fichero `'use server'` lo publicaría como un POST más
 * sin que nadie lo necesite — «una acción ES un endpoint», y este no hace falta
 * que lo sea.
 *
 * Esto **sustituye** a `getChatUnreadCountAction`, que estaba en el repo, no la
 * llamaba nadie y estaba rota por cuatro sitios a la vez: preguntaba a
 * Evolution por **una sola** línea, no servía para Waha ni para los canales de
 * credenciales, no descontaba las marcas de borrado, y se tragaba cualquier
 * fallo en un `catch { return 0 }` — o sea que un error y «no hay nada» se
 * veían igual.
 */

/**
 * A qué líneas y a qué cuentas alcanza la bandeja de quien mira.
 *
 * Es el mismo alcance de `app/(root)/chats/page.tsx`, resuelto barato: allí son
 * cinco consultas en paralelo porque además hace falta la ficha de cada línea
 * —nombre, tipo, clave de Evolution—; aquí solo hacen falta los nombres, y eso
 * es **una** consulta sobre `Instancias` por su índice de `userId`, más las
 * cuentas asociadas, que ya vienen recordadas unos segundos
 * (`lib/cache-de-sesion`).
 *
 * Las dos reglas que no se pueden aflojar, porque las dos harían que el icono
 * prometiera lo que la bandeja no enseña:
 *
 * 1. **Un `agente` trabaja en UNA cuenta.** No se le juntan las líneas de las
 *    vinculadas, igual que en la bandeja. Sin esto le saldría un número con
 *    chats que ni siquiera puede abrir.
 * 2. **De la cuenta de SESIÓN solo entran sus líneas de Meta/WhatsApp.** Es lo
 *    que hace la bandeja al entrar en una cuenta ajena, y es donde este alcance
 *    y aquel se separarían: con todas sus líneas dentro, el icono contaría
 *    conversaciones que esa pantalla no lista.
 */
async function laBandejaDeQuienMira(user: {
  id: string;
  ownerId?: string | null;
  sessionUserId?: string;
  advisorRole?: string | null;
}): Promise<{ cuentas: string[]; lineas: string[] }> {
  const cuentaActiva = user.ownerId ?? user.id;
  const esAgenteDeLaCuenta = !!user.ownerId && user.advisorRole !== "administrador";

  const cuentas = esAgenteDeLaCuenta
    ? [cuentaActiva]
    : await getAssociatedAccountIds(user);

  const sesion = user.sessionUserId ?? user.id;
  // Las de sesión solo cuentan por la puerta estrecha de Meta/WhatsApp, así que
  // se piden aparte de las demás.
  const principales = cuentas.filter((id) => id !== sesion || id === cuentaActiva);

  const filas = await db.instancia.findMany({
    where: {
      OR: [
        { userId: { in: principales } },
        ...(sesion && sesion !== cuentaActiva && !esAgenteDeLaCuenta
          ? [
              {
                userId: sesion,
                instanceType: "meta",
                OR: [{ metaChannel: "whatsapp" }, { metaChannel: null }],
              },
            ]
          : []),
      ],
    },
    select: { instanceName: true },
  });

  return {
    cuentas,
    lineas: Array.from(new Set(filas.map((f) => f.instanceName).filter(Boolean))),
  };
}

/**
 * El número y la hora del más nuevo. Sin líneas conectadas es cero, que aquí es
 * el dato: esa cuenta no tiene bandeja que mirar.
 */
export async function losChatsQueEsperan(user: {
  id: string;
  ownerId?: string | null;
  sessionUserId?: string;
  advisorRole?: string | null;
}): Promise<{ total: number; masNuevo: number }> {
  const { cuentas, lineas } = await laBandejaDeQuienMira(user);
  if (!cuentas.length || !lineas.length) return { total: 0, masNuevo: 0 };
  return contarChatsSinLeer({ userIds: cuentas, instanceNames: lineas });
}
