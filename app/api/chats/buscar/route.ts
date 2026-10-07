import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { responderJson } from "@/lib/responder-json";
import { lasCuentasQueVeLaBandeja } from "@/lib/cuentas-asociadas";
import { esAgenteDeLaCuenta } from "@/lib/alcance-de-la-bandeja";
import { resolveInstanceOwner } from "@/lib/chat-persistence";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { buscarEnLosMensajes, losAsesoresDeLosResultados } from "@/lib/busqueda-en-mensajes.server";
import { loQueVeUnAgente, type ResultadoDeBusqueda } from "@/lib/busqueda-en-mensajes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Busca DENTRO de los mensajes de las lineas de la bandeja: palabras, frases,
 * fechas o cualquier dato escrito. Las reglas: `lib/busqueda-en-mensajes.ts`.
 *
 * Es una ruta y no una accion de servidor por lo mismo que `/api/chats/lista`:
 * Next encola las acciones de una pagina, y una busqueda que se escribe tecla a
 * tecla no puede esperar detras de los relojes de la bandeja.
 *
 * ## La puerta
 *
 * Sesion aqui (ninguna ruta confia solo en el middleware); las cuentas son las
 * que ENSEÑA la bandeja (`lasCuentasQueVeLaBandeja`), y cada linea pedida se
 * comprueba contra ellas con su dueño. Un `agente` ve solo lo suyo
 * (`loQueVeUnAgente`), filtrado aqui y no en el navegador.
 */

const TOPE_DE_LINEAS = 40;
const TOPE_DEL_TEXTO = 200;

export type RespuestaDeLaBusqueda = { success: true; resultados: ResultadoDeBusqueda[] } | { success: false; message: string };

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => null)) as
    | { q?: unknown; instanceNames?: unknown; tzOffset?: unknown }
    | null;
  const texto = typeof cuerpo?.q === "string" ? cuerpo.q.trim().slice(0, TOPE_DEL_TEXTO) : "";
  const pedidas = Array.isArray(cuerpo?.instanceNames)
    ? [...new Set(cuerpo!.instanceNames
        .filter((n): n is string => typeof n === "string")
        .map((n) => n.trim())
        .filter(Boolean))].slice(0, TOPE_DE_LINEAS)
    : [];
  const desfase = Number(cuerpo?.tzOffset);
  const desfaseMin = Number.isFinite(desfase) && Math.abs(desfase) <= 14 * 60 ? desfase : 0;

  if (!texto || !pedidas.length) {
    return NextResponse.json({ success: true, resultados: [] } satisfies RespuestaDeLaBusqueda);
  }

  try {
    const cuentas = await lasCuentasQueVeLaBandeja(user);
    const lineas: string[] = [];
    const cuentasDeLasLineas = new Set<string>();
    for (const linea of pedidas) {
      const dueno = await resolveInstanceOwner(linea);
      if (dueno?.userId && cuentas.includes(dueno.userId)) {
        lineas.push(linea);
        cuentasDeLasLineas.add(dueno.userId);
      } else {
        console.warn("[busqueda] se pidio buscar en una linea que no es de estas cuentas", {
          linea,
          quienPregunta: user.id,
        });
      }
    }

    let resultados = await buscarEnLosMensajes({
      texto,
      cuentas,
      lineas,
      desfaseMin,
    });

    if (esAgenteDeLaCuenta(user)) {
      const asesores = await losAsesoresDeLosResultados(cuentas, resultados);
      resultados = loQueVeUnAgente(
        resultados,
        asesores,
        laPersonaQueActua(user).id,
        user.canTakeUnassigned ?? true,
      );
    }

    return responderJson(request, { success: true, resultados } satisfies RespuestaDeLaBusqueda);
  } catch (error) {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    console.error("[busqueda] no se pudo buscar en los mensajes", {
      codigo: e?.meta?.code ?? e?.code,
      mensaje: e?.message,
    });
    return NextResponse.json(
      { success: false, message: "No se pudo buscar en los mensajes." } satisfies RespuestaDeLaBusqueda,
      { status: 500 },
    );
  }
}
