import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { responderJson } from "@/lib/responder-json";
import { getSesionesDeLaCuenta } from "@/actions/session-action";
import { comprimirSesiones, type SesionesPorElCable } from "@/lib/sesiones-por-el-cable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Las sesiones de la cuenta: lo que pinta el asesor, las etiquetas, el estado
 * del lead y el chip de minutos de cada fila.
 *
 * ## Por que sale de la cola de acciones
 *
 * Era una accion de servidor, y Next las atiende de una en una. Con la lista y
 * el bootstrap ya fuera, esta se quedo como la unica grande que seguia dentro:
 * `esperoEnColaMs` 0 pero `tardoMs` 1.743, con el servidor reportando 454. Los
 * 1.289 ms de hueco escalaban con la cantidad -750 ms con 206 sesiones, 1.289
 * con 733-, asi que no era la consulta ni la espera: era el traslado.
 *
 * ## Y por que pesa menos
 *
 * Ver `lib/sesiones-por-el-cable.ts`: las etiquetas van UNA vez en un
 * diccionario en vez de repetidas enteras en cada sesion, y los campos vacios
 * no viajan. El navegador reconstruye la forma de siempre al recibirlas, asi
 * que ningun otro sitio se entera.
 *
 * ## La puerta
 *
 * `getSesionesDeLaCuenta` ya comprueba cuenta por cuenta a quien se le puede
 * contestar y deja fuera las demas con aviso. Aqui se comprueba ademas que haya
 * sesion, porque ninguna ruta `/api` confia solo en el middleware (ver
 * CLAUDE.md): se pudo saltar con la CVE-2025-29927 y volvera a poder.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => null)) as
    | { sessionUserIds?: unknown }
    | null;
  const pedidos = Array.isArray(cuerpo?.sessionUserIds)
    ? cuerpo!.sessionUserIds.filter((id): id is string => typeof id === "string" && !!id)
    : [];

  const resultado = await getSesionesDeLaCuenta(pedidos.length ? pedidos : user.id);
  if (!resultado.success) {
    return NextResponse.json({
      success: false,
      message: resultado.message,
      tiempos: resultado.tiempos,
    });
  }

  const arrancoComprimir = Date.now();
  const porElCable = comprimirSesiones(resultado.data ?? []);
  const comprimirMs = Date.now() - arrancoComprimir;

  return responderJson(request, {
    success: true,
    message: resultado.message,
    data: porElCable,
    // `comprimirMs` al lado de los demas: si algun dia costara mas de lo que
    // ahorra, se ve aqui y no hay que deducirlo.
    tiempos: { ...(resultado.tiempos ?? {}), comprimir: comprimirMs },
  } satisfies RespuestaDeLasSesiones);
}

export type RespuestaDeLasSesiones =
  | {
      success: true;
      message: string;
      data: SesionesPorElCable;
      tiempos?: Record<string, number>;
    }
  | { success: false; message: string; tiempos?: Record<string, number> };
