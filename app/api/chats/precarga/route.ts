import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { responderJson } from "@/lib/responder-json";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import { resolveInstanceOwner } from "@/lib/chat-persistence";
import { warmChatMessagesAction } from "@/actions/chat-manual-actions";
import { warmChannelMessages } from "@/actions/channel-chat-actions";
import type { FindMessagesResult } from "@/actions/chat-actions";
import {
  PLAZO_DEL_PAQUETE_MS,
  TOPE_DE_CHATS_POR_PAQUETE,
  TOPE_DE_ALIAS_POR_CHAT,
  A_LA_VEZ_DENTRO_DEL_SERVIDOR,
  type ChatPrecargado,
  type RespuestaDePrecarga,
} from "@/lib/precarga-de-chats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * La precarga de varias conversaciones, en UNA peticion.
 *
 * ## Que problema resuelve
 *
 * Sacar la precarga a `/api/chats/conversacion` (#688) quito la cola de
 * acciones de Next y bajo lo que cuesta cada consulta; el recorte por rama
 * (#696) bajo la consulta en si de 36 ms a 1. Medido despues en produccion:
 * cada peticion entre **175 y 350 ms**, la peor 532.
 *
 * Pero seguian siendo **50 peticiones**. Y ese numero ya no es servidor: el
 * navegador abre seis conexiones a la vez, asi que la mayoria de esos
 * milisegundos son **turno**, no trabajo. Por eso no se veian por ningun lado
 * los 30 ms de la base.
 *
 * Son dos tandas y no una -los primeros chats a los 300 ms y el precalentado a
 * los 2,5 s-, asi que agrupandolas salen **dos peticiones**, que son las que ya
 * existian.
 *
 * ## Una que falle no puede llevarse a las demas
 *
 * `Promise.allSettled`, nunca `Promise.all`: con `all` un solo rechazo tira las
 * 49 respuestas buenas que ya estaban resueltas. Cada chat va en su casilla.
 *
 * ## Y una que TARDE, tampoco
 *
 * Que es el riesgo de verdad, no el fallo. `warmChatMessagesAction` espera
 * hasta 9 s a Evolution, asi que un chat lento retrasaria a los otros 49: peor
 * que antes, donde 49 llegaban y uno se quedaba atras.
 *
 * El paquete lleva **su propio plazo**, por debajo del de Evolution
 * (`PLAZO_DEL_PAQUETE_MS`, ver `lib/precarga-de-chats.ts`). Al cumplirse se
 * contesta con lo que haya listo y lo demas vuelve como `pendiente`.
 *
 * Y **lo que siga corriendo no se tira**: Evolution sigue de fondo hasta su
 * propio corte y lo que traiga se persiste igual, asi que la tanda siguiente lo
 * recoge de nuestra base. Es la regla de siempre -agotar la espera no es tirar
 * la respuesta- aplicada a un paquete.
 *
 * ## La puerta es la misma
 *
 * El alcance se comprueba una vez (`getAssociatedAccountIds`) y el dueño se
 * resuelve **por linea distinta**, que son dos o tres y no cincuenta. Un chat
 * de una linea que no sea de estas cuentas vuelve rechazado **en su casilla**,
 * sin tumbar el paquete: es lo mismo que contesta hoy la ruta de a uno.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => null)) as {
    chats?: unknown;
    pageSize?: unknown;
  } | null;

  const pedidos = leerLosChatsPedidos(cuerpo?.chats);
  if (!pedidos.length) {
    return NextResponse.json(
      { success: false, message: "No se pidio ningun chat." },
      { status: 400 },
    );
  }

  const pageSize = Number(cuerpo?.pageSize) > 0 ? Number(cuerpo?.pageSize) : undefined;
  const cuentas = await getAssociatedAccountIds(user);

  // El dueño, una vez por LINEA. Con cincuenta chats de dos lineas esto son dos
  // consultas, no cincuenta.
  const duenos = await resolverLasLineas(
    Array.from(new Set(pedidos.map((p) => p.instanceName))),
  );

  const empezoEnMs = Date.now();
  const seAcabaEn = empezoEnMs + PLAZO_DEL_PAQUETE_MS;

  const resultados = await enTandas(pedidos, A_LA_VEZ_DENTRO_DEL_SERVIDOR, (pedido) =>
    traerUnChat(pedido, {
      duenos,
      cuentas,
      pageSize,
      seAcabaEn,
      quienPregunta: user.id,
    }),
  );

  const pendientes = resultados.filter((r) => r.estado === "pendiente").length;
  const rechazados = resultados.filter((r) => r.estado === "rechazado").length;
  const tardoMs = Date.now() - empezoEnMs;

  // Un paquete que se pasa de plazo o que deja gente fuera se dice. Sin esto se
  // ve como una App que "a veces no precarga", que no parece un error.
  if (pendientes || rechazados || tardoMs > PLAZO_DEL_PAQUETE_MS) {
    console.warn("[chats] un paquete de precarga no vino entero", {
      pedidos: pedidos.length,
      pendientes,
      rechazados,
      tardoMs,
    });
  }

  const respuesta: RespuestaDePrecarga = {
    success: true,
    chats: resultados,
    tardoMs,
  };
  return responderJson(request, respuesta);
}

type Pedido = {
  instanceName: string;
  remoteJid: string;
  remoteJidAliases: string[];
};

/**
 * Los chats del cuerpo, limpios, sin repetidos y acotados.
 *
 * El tope no es decoracion: sin el, este cuerpo pide las conversaciones que
 * quiera de una sola vez.
 */
function leerLosChatsPedidos(crudo: unknown): Pedido[] {
  if (!Array.isArray(crudo)) return [];

  const vistos = new Set<string>();
  const pedidos: Pedido[] = [];

  for (const entrada of crudo) {
    if (!entrada || typeof entrada !== "object") continue;
    const e = entrada as Record<string, unknown>;
    const instanceName = typeof e.instanceName === "string" ? e.instanceName.trim() : "";
    const remoteJid = typeof e.remoteJid === "string" ? e.remoteJid.trim() : "";
    if (!instanceName || !remoteJid) continue;

    const llave = `${instanceName}::${remoteJid}`;
    if (vistos.has(llave)) continue;
    vistos.add(llave);

    pedidos.push({
      instanceName,
      remoteJid,
      remoteJidAliases: Array.isArray(e.remoteJidAliases)
        ? e.remoteJidAliases
            .filter((a): a is string => typeof a === "string" && !!a)
            .slice(0, TOPE_DE_ALIAS_POR_CHAT)
        : [],
    });

    if (pedidos.length >= TOPE_DE_CHATS_POR_PAQUETE) break;
  }

  return pedidos;
}

type DuenoDeLinea = Awaited<ReturnType<typeof resolveInstanceOwner>>;

async function resolverLasLineas(lineas: string[]): Promise<Map<string, DuenoDeLinea>> {
  const pares = await Promise.all(
    lineas.map(async (linea) => {
      try {
        return [linea, await resolveInstanceOwner(linea)] as const;
      } catch (error) {
        console.warn("[chats] no se pudo resolver el dueño de una linea al precargar", {
          linea,
          error: error instanceof Error ? error.message : String(error),
        });
        return [linea, null] as const;
      }
    }),
  );
  return new Map(pares);
}

async function traerUnChat(
  pedido: Pedido,
  ctx: {
    duenos: Map<string, DuenoDeLinea>;
    cuentas: string[];
    pageSize?: number;
    seAcabaEn: number;
    quienPregunta: string;
  },
): Promise<ChatPrecargado> {
  const base = { instanceName: pedido.instanceName, remoteJid: pedido.remoteJid };

  const dueno = ctx.duenos.get(pedido.instanceName);
  if (!dueno?.userId) {
    return { ...base, estado: "rechazado", motivo: "esa linea no existe" };
  }
  if (!ctx.cuentas.includes(dueno.userId)) {
    console.warn("[chats] se pidio precargar una linea que no es de estas cuentas", {
      instanceName: pedido.instanceName,
      quienPregunta: ctx.quienPregunta,
    });
    return { ...base, estado: "rechazado", motivo: "esa linea no es de esta cuenta" };
  }

  // Lo que queda de plazo para ESTE chat. Se mide contra el final del paquete,
  // no contra el principio de cada uno: si no, cada tanda estrenaria plazo y el
  // paquete duraria lo que durase el chat mas lento por el numero de tandas.
  const queda = ctx.seAcabaEn - Date.now();
  if (queda <= 0) return { ...base, estado: "pendiente" };

  const opciones = {
    page: 1,
    pageSize: ctx.pageSize,
    remoteJidAliases: pedido.remoteJidAliases,
    localFirst: true,
  };

  const tipo = (dueno.instanceType ?? "").trim().toLowerCase();
  const trabajo: Promise<FindMessagesResult> =
    tipo === "meta" || tipo === "telegram"
      ? warmChannelMessages(pedido.instanceName, pedido.remoteJid, opciones)
      : // `apiKeyData: null` a proposito: que la clave la resuelva el servidor.
        warmChatMessagesAction(
          { apiKeyData: null, instanceName: pedido.instanceName },
          pedido.remoteJid,
          opciones,
        );

  // Que reviente uno no puede tumbar el paquete, y que TARDE tampoco. El
  // trabajo sigue corriendo detras hasta su propio corte y lo que traiga se
  // persiste igual: la tanda siguiente lo recoge de nuestra base.
  const trabajoSeguro = trabajo.catch((error): ChatPrecargado => {
    console.warn("[chats] un chat del paquete de precarga fallo", {
      instanceName: pedido.instanceName,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...base, estado: "rechazado", motivo: "no se pudo leer" };
  });

  const resultado = await Promise.race([
    trabajoSeguro.then((r): ChatPrecargado =>
      "estado" in r ? r : { ...base, estado: "listo", resultado: r },
    ),
    esperar(queda).then((): ChatPrecargado => ({ ...base, estado: "pendiente" })),
  ]);

  return resultado;
}

/**
 * Como maximo `cuantos` a la vez, para no comerse el pool de conexiones.
 *
 * ## Turnos, NO tandas
 *
 * Son `cuantos` obreros tirando de una cola comun, y no lotes de `cuantos` que
 * se esperan unos a otros. La diferencia no es de estilo: **con lotes, un chat
 * colgado retiene su lote entero hasta el plazo del paquete**, y los lotes de
 * detras no llegan a empezar. Se vio en el banco de pruebas: 12 chats con 2
 * colgados devolvia 4 listos y 8 pendientes, cuando lo correcto son 10 y 2.
 *
 * Eso es exactamente el mal que este paquete vino a quitar -esperar turno en
 * vez de trabajar-, reaparecido dentro del servidor. Con obreros, el que se
 * queda pillado retiene su sitio y los otro cuatro siguen vaciando la cola.
 */
async function enTandas<T, R>(
  cosas: T[],
  cuantos: number,
  hacer: (cosa: T) => Promise<R>,
): Promise<R[]> {
  // Por posicion, para que la respuesta salga en el orden en que se pidio
  // aunque terminen desordenadas.
  const salida = new Array<R>(cosas.length);
  const huecos: number[] = [];
  let siguiente = 0;

  const obrero = async () => {
    for (;;) {
      const i = siguiente;
      siguiente += 1;
      if (i >= cosas.length) return;
      try {
        salida[i] = await hacer(cosas[i]);
      } catch (error) {
        // `traerUnChat` ya captura lo suyo; esta es la red que hace que sea
        // cierto pase lo que pase. Un rechazo aqui se queda en su casilla.
        console.warn("[chats] una casilla del paquete de precarga reviento", {
          error: error instanceof Error ? error.message : String(error),
        });
        huecos.push(i);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, cuantos) }, obrero));

  // Los huecos se quitan al final: un `undefined` suelto en la respuesta se
  // veria en el navegador como un chat sin estado.
  if (!huecos.length) return salida;
  const perdidos = new Set(huecos);
  return salida.filter((_, i) => !perdidos.has(i));
}

function esperar(ms: number): Promise<void> {
  return new Promise((listo) => {
    const t = setTimeout(listo, ms);
    // Que un plazo pendiente no mantenga vivo el proceso.
    if (typeof t === "object" && t && "unref" in t) (t as { unref: () => void }).unref();
  });
}
