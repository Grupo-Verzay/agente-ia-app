import { NextResponse } from "next/server";
import { avisarSiElDiaSeSalioDeLoNormal } from "@/actions/vigilancia-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Una vuelta al dia: juzga AYER y avisa si se salio de lo normal.
 *
 * ## Que la hace util: que casi siempre no haga nada
 *
 * Un vigilante que avisa de mas se ignora a la semana, y entonces no vigila
 * nada. Lo normal es que esta ruta conteste `todo bien` y no mande nada. Solo
 * habla cuando **el dia entero** de una cuenta se sale: su carga normal por
 * encima del umbral, una cuarta parte de las cargas malas, o el doble de su
 * propia costumbre.
 *
 * Y avisa **una vez al dia como techo**, porque corre una vez al dia. Una
 * persona con mala conexion no puede despertar a nadie.
 *
 * ## La puerta
 *
 * Su clave, como el resto de los crons (`CRON_SECRET`). No confia en el
 * middleware, que se pudo saltar una vez y volvera a poder (ver CLAUDE.md).
 *
 * ## Como se prueba a mano
 *
 *     curl -X POST https://<dominio>/api/cron/vigilancia-de-chats \
 *       -H "x-cron-secret: $CRON_SECRET"
 *
 * Contesta que decidio y por que, asi que una vuelta que NO avisa tampoco es
 * muda: sin eso, "no me llego nada" no distingue "todo bien" de "el cron no
 * corrio".
 */
const CABECERA = "x-cron-secret";

function tienePermiso(request: Request): boolean {
  const esperado = (process.env.CRON_SECRET ?? "").trim();
  if (!esperado) return false;
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  return (token || (request.headers.get(CABECERA) ?? "").trim()) === esperado;
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, message: "CRON_SECRET no configurado." },
      { status: 500 },
    );
  }
  if (!tienePermiso(request)) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  try {
    const resultado = await avisarSiElDiaSeSalioDeLoNormal();
    return NextResponse.json(resultado, { status: 200 });
  } catch (error) {
    // Un cron que revienta en silencio es una vigilancia que parece estar
    // puesta y no lo esta.
    console.warn("[vigilancia] la vuelta diaria reviento", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, message: "La vuelta de vigilancia fallo." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
