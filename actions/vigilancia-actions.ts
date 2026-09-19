import "server-only";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { puedeVerLaAnaliticaDeLaCasa } from "@/lib/analitica-de-la-casa";
import { leerLosDiasVigilados, type DiaVigilado } from "@/lib/vigilancia-de-chats";
import { juzgarElDia, redactarElAviso } from "@/lib/vigilancia-veredicto";
import {
  resolveWhatsAppDispatcherLine,
  anotarQueNoHabiaLinea,
  sendViaWhatsAppDispatcher,
} from "@/actions/whatsapp-dispatcher";
import { normalizeChatHistoryRemoteJid } from "@/lib/chat-history/build-session-id";
import { DIAS_QUE_SE_MIRAN, type VistaDeLaVigilancia } from "@/lib/vigilancia-vista";

/**
 * La vigilancia de rendimiento de Chats: leerla y avisar de ella.
 *
 * ## Es interna, y el cliente no se entera de que existe
 *
 * El aviso sale **solo** a la cuenta de superadministrador, con la cuenta
 * afectada nombrada dentro. Que a un cliente le llegue un WhatsApp diciendo que
 * su App va lenta seria decirle un problema antes de tener el arreglo.
 *
 * Y la pantalla, igual: `leerLaVigilancia` no devuelve nada a quien no sea
 * superadministrador. La puerta esta **aqui** y no en el componente: enseñar el
 * bloque o no es cosa de la pantalla; **que los datos salgan es cosa de esto**.
 * Es la misma regla de siempre: quien decide es la consulta, no la pantalla.
 *
 * ## Y quien la ve lo decide UNA funcion, la misma que la pagina
 *
 * Esto preguntaba por `user.role`, o sea por la persona; luego por
 * `cuentaQueManda(...)` con `isSuperAdmin`, que era su propia condicion, y por
 * eso una cuenta ADMINISTRADORA abria Analiticas —la pagina pide `isAdminLike`—
 * y veia la pantalla sin este recuadro. Dos formulas para la misma pantalla.
 *
 * Ahora las dos preguntan lo mismo, `puedeVerLaAnaliticaDeLaCasa`
 * (`lib/analitica-de-la-casa.ts`): las cuentas de la casa —administradora y
 * superadministradora— ven la Analitica completa; `user`, `affiliate` y
 * `reseller` siguen fuera, con su cartera por otro camino.
 *
 * Y el WhatsApp sigue saliendo solo hacia la cuenta de superadministrador: eso
 * se decide mas abajo, en `elSuperAdministrador`, y es otra pregunta —a quien
 * se le avisa— que no se toca.
 *
 * ## Y esto NO es un fichero de acciones
 *
 * Llevaba `'use server'`, que convierte cada funcion exportada en un endpoint
 * POST al que se llega desde el navegador. Aqui eso dejaba a cualquiera con
 * sesion disparar `avisarSiElDiaSeSalioDeLoNormal`, o sea mandarle un WhatsApp
 * al superadministrador cuando quisiera y tantas veces como quisiera — y un
 * aviso que llega todo el dia se aprende a despachar sin leer, que es
 * justamente lo que esta vigilancia existe para evitar.
 *
 * No hacia falta: a este fichero no lo importa ni un componente de cliente. La
 * lee `panel/analytics/page.tsx`, que es un componente de SERVIDOR y la llama
 * dentro del mismo proceso, y la dispara el cron de madrugada. `server-only`
 * conserva lo unico que la etiqueta aportaba —que esto no se empaquete nunca
 * hacia el navegador— y quita el endpoint.
 */

export async function leerLaVigilancia(): Promise<VistaDeLaVigilancia | null> {
  const user = await currentUser();
  if (!user?.id) return null;
  if (!(await puedeVerLaAnaliticaDeLaCasa(user))) return null;

  const dias = await leerLosDiasVigilados(DIAS_QUE_SE_MIRAN);
  const nombres = await nombresDeLasCuentas(dias.map((d) => d.userId));
  const hoy = new Date().toISOString().slice(0, 10);

  // El MISMO juicio que decide el WhatsApp, sobre el ultimo dia con datos.
  //
  // Sin esto la pantalla se inventaba su propio criterio, y una cuenta que se
  // degrada sin cruzar el umbral -la degradacion lenta, justo la que el aviso
  // existe para cazar- salia en el WhatsApp y no aparecia aqui. Recibir un
  // aviso y no encontrar la cuenta es peor que no recibirlo.
  const elDiaJuzgado = dias.length ? dias[0].dia : null;
  const veredicto = elDiaJuzgado ? juzgarElDia(elDiaJuzgado, dias) : null;
  const señaladasPorElVeredicto =
    veredicto?.hayQueAvisar && veredicto.motivo === "cuentas degradadas"
      ? veredicto.cuentas.map((c) => c.userId)
      : [];

  return {
    dias: dias.map((d) => ({ ...d, nombre: nombres.get(d.userId) ?? d.userId })),
    hayDeHoy: dias.some((d) => d.dia === hoy),
    señaladasPorElVeredicto,
    elDiaJuzgado,
  };
}

/**
 * Juzga un dia y, si hace falta, manda UN WhatsApp al superadministrador.
 *
 * La llama el cron de madrugada. Devuelve lo que decidio y por que, para que
 * una vuelta que no avisa tampoco sea muda: sin esto, "no me llego nada" no
 * distingue "todo bien" de "el cron no corrio".
 */
export async function avisarSiElDiaSeSalioDeLoNormal(): Promise<{
  success: boolean;
  aviso: string;
  enviadoA?: string;
  message?: string;
}> {
  // Se juzga AYER y no hoy: hoy esta a medias, y medio dia siempre parece otra
  // cosa de lo que fue.
  const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Con margen, para que "su costumbre" tenga de donde salir.
  const historial = await leerLosDiasVigilados(45);
  const veredicto = juzgarElDia(ayer, historial);

  if (!veredicto.hayQueAvisar) {
    console.info("[vigilancia] el dia no merece aviso", { dia: ayer, motivo: veredicto.motivo });
    return { success: true, aviso: veredicto.motivo };
  }

  const nombres = await nombresDeLasCuentas(
    veredicto.motivo === "cuentas degradadas" ? veredicto.cuentas.map((c) => c.userId) : [],
  );
  const texto = redactarElAviso(ayer, veredicto, nombres);
  if (!texto) return { success: true, aviso: "nada que decir" };

  const jefe = await elSuperAdministrador();
  if (!jefe) {
    // Un aviso que no tiene a donde ir no puede perderse en silencio: entonces
    // la vigilancia parece funcionar y no avisa de nada. Va con el texto puesto
    // para que al menos quede en el registro del contenedor.
    console.warn("[vigilancia] HAY QUE AVISAR y no hay a quien", { dia: ayer, texto });
    return {
      success: false,
      aviso: veredicto.motivo,
      message: "Sin superadministrador con numero de notificacion.",
    };
  }

  const linea = await resolveWhatsAppDispatcherLine({ includeAdminFallback: true });
  if (!linea) {
    console.warn("[vigilancia] HAY QUE AVISAR y no hay linea por donde", { dia: ayer, texto });
    // Sin linea no se llega al despachador: esto se anota aqui o no se anota.
    await anotarQueNoHabiaLinea({
      tipo: "desconexion",
      cuentaId: jefe.id,
      destinatario: jefe.notificationNumber,
      motivo: "Ninguna linea conectada para enviar el aviso de vigilancia.",
    });
    return { success: false, aviso: veredicto.motivo, message: "Ninguna linea conectada para enviar." };
  }

  const res = await sendViaWhatsAppDispatcher({
    dispatcher: linea,
    remoteJid: normalizeChatHistoryRemoteJid(jefe.notificationNumber),
    text: texto,
    history: {
      instanceName: linea.instanceName,
      type: "notification",
      additionalKwargs: { kind: "vigilancia-de-chats", userId: jefe.id },
    },
    // La vigilancia avisa de lineas que dejaron de pasar mensajes, asi que
    // comparte tipo con el aviso de desconexion: las dos son «una linea se
    // cayo y hay que decirlo».
    registro: { tipo: "desconexion", cuentaId: jefe.id },
  });

  if (!res.success) {
    console.warn("[vigilancia] no se pudo enviar el aviso", { dia: ayer, message: res.message, texto });
    return { success: false, aviso: veredicto.motivo, message: res.message };
  }

  console.info("[vigilancia] aviso enviado", { dia: ayer, motivo: veredicto.motivo });
  return { success: true, aviso: veredicto.motivo, enviadoA: jefe.id };
}

/**
 * El relleno con el que nace `notificationNumber`.
 *
 * La columna NO es nula -tiene `@default("0000000000")`-, asi que "sin numero"
 * es este valor y no un nulo. Buscar por `not: null` devolveria a todo el
 * mundo, y el aviso saldria hacia un numero que no existe: un envio que falla
 * en silencio se parece demasiado a un dia sin novedades.
 */
const NUMERO_DE_RELLENO = "0000000000";

/**
 * El superadministrador con numero de notificacion de verdad.
 *
 * Si hubiera varios se coge el mas antiguo, a proposito: que el destinatario
 * del aviso no cambie solo porque alguien creo otra cuenta.
 */
async function elSuperAdministrador(): Promise<{ id: string; notificationNumber: string } | null> {
  const fila = await db.user.findFirst({
    where: {
      role: "super_admin",
      notificationNumber: { notIn: ["", NUMERO_DE_RELLENO] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, notificationNumber: true },
  });
  const numero = fila?.notificationNumber?.trim();
  if (!fila || !numero || numero === NUMERO_DE_RELLENO) return null;
  return { id: fila.id, notificationNumber: numero };
}

async function nombresDeLasCuentas(ids: string[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (!unicos.length) return new Map();
  try {
    const filas = await db.user.findMany({
      where: { id: { in: unicos } },
      select: { id: true, name: true, email: true },
    });
    return new Map(filas.map((f) => [f.id, f.name?.trim() || f.email || f.id]));
  } catch (error) {
    // Con el id se entiende igual; sin aviso, no.
    console.warn("[vigilancia] no se pudieron leer los nombres de las cuentas", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}
