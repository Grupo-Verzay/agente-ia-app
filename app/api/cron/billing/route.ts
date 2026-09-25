import { runBillingDailyJobSystem } from "@/actions/billing/billing-job-actions";
import { runResellerBillingForAll } from "@/lib/reseller-billing-runner.server";
import { purgarCuentasEliminadasPendientes } from "@/lib/purge-account.server";
import { podarRevisionesDePromptsPendientes } from "@/lib/prompt-revisions-cleanup.server";
import { runRecordatoriosDeCobros } from "@/lib/cobros-runner";
import { runAvisosDeVencimiento } from "@/lib/avisos-de-vencimiento-runner";
import { runGrabacionesDeReuniones } from "@/lib/grabaciones-runner.server";
import { rescatarLlamadasSinCerrar } from "@/lib/rescate-de-llamadas.server";
import { runPapeleraDeEmbudos } from "@/lib/papelera-de-embudos-runner.server";
import { TOPE_EN_LA_VUELTA_DIARIA } from "@/lib/rescate-de-llamadas";
import { NextResponse } from "next/server";

const CRON_HEADER = "x-cron-secret";

function getRequestSecret(request: Request): string {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    return bearer.slice("Bearer ".length).trim();
  }
  return (request.headers.get(CRON_HEADER) ?? "").trim();
}

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  return getRequestSecret(request) === expected;
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, message: "CRON_SECRET no está configurado." },
      { status: 500 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  const result = await runBillingDailyJobSystem();

  // Cobros por-reseller (sus clientes), con la instancia y mensajes del reseller.
  let resellerBilling: unknown = null;
  try {
    resellerBilling = await runResellerBillingForAll();
  } catch (e) {
    resellerBilling = { error: e instanceof Error ? e.message : String(e) };
  }

  // Rezagadas del borrado de cuentas: la purga corre en segundo plano al pulsar
  // Eliminar, así que un reinicio a mitad dejaría la cuenta apagada pero con sus
  // datos dentro. Aquí se retoma. Si no hay ninguna pendiente no hace nada.
  let purgaCuentas: unknown = null;
  try {
    purgaCuentas = await purgarCuentasEliminadasPendientes();
  } catch (e) {
    purgaCuentas = { error: e instanceof Error ? e.message : String(e) };
  }

  // Histórico de revisiones de prompts acumulado antes de que el publicado
  // empezara a podar. Se pone al día de poco en poco; si no hay nada que
  // recortar, no hace nada.
  let podaRevisiones: unknown = null;
  try {
    podaRevisiones = await podarRevisionesDePromptsPendientes();
  } catch (e) {
    podaRevisiones = { error: e instanceof Error ? e.message : String(e) };
  }

  // Los recordatorios de Cobros: la cartera de cada cuenta con SUS clientes.
  //
  // Cuelga de aquí porque este cron ya lo llama n8n una vez al día; con ruta
  // propia habría que añadirle su flujo y hasta entonces no saldría ni un
  // aviso. Va envuelto: **un fallo suyo no puede tumbar el cobro de la
  // plataforma**, que es lo que de verdad importa de esta ruta. Y no es mudo —
  // su cuenta sale en la respuesta.
  let cobros: unknown = null;
  try {
    cobros = await runRecordatoriosDeCobros();
  } catch (e) {
    cobros = { error: e instanceof Error ? e.message : String(e) };
    console.warn("[cobros] la vuelta diaria reventó", { error: cobros });
  }

  // Los dos avisos de vencimiento de Proyectos y Tickets: uno la víspera y
  // otro el mismo día. Cuelga de aquí por lo mismo que los cobros —este cron ya
  // se llama una vez al día— y va envuelto por lo mismo: un fallo suyo no puede
  // tumbar el cobro de la plataforma. Su cuenta sale en la respuesta, así que
  // se ve si un día deja de mandar nada.
  let vencimientos: unknown = null;
  try {
    vencimientos = await runAvisosDeVencimiento();
  } catch (e) {
    vencimientos = { error: e instanceof Error ? e.message : String(e) };
    console.warn("[vencimientos] la vuelta diaria reventó", { error: vencimientos });
  }

  // Las grabaciones de reuniones: recoger las que se quedaron colgadas y
  // borrar las que pasaron de los 180 dias. En su propio `try`, como los
  // demas: un barrido que se cuelgue no puede tumbar el cobro, que es lo que
  // de verdad importa de esta vuelta.
  let grabaciones: unknown = null;
  try {
    grabaciones = await runGrabacionesDeReuniones();
  } catch (e) {
    grabaciones = { error: e instanceof Error ? e.message : String(e) };
  }

  // Las llamadas a las que no les llego el aviso de fin. Es la red de abajo
  // de `/api/calls/call-ended`, y cuelga tambien de aqui —ademas de su propio
  // reloj en el backend— porque esta vuelta diaria es lo unico que corre
  // aunque ese reloj se quede sin configurar en un redespliegue: justo el
  // fallo que este barrido viene a tapar. En su propio `try`, como los demas.
  //
  // **Con un tope corto, y no es el de siempre.** Quien llama a esta ruta es
  // el reloj de facturacion del backend, que corta a los 20 segundos
  // (`BILLING_CRON_TIMEOUT_MS`, con un `AbortController` de verdad). Cada
  // rescate se baja un WAV entero y lo transcribe, asi que una vuelta con el
  // tope normal se come ese presupuesto varias veces y deja al backend
  // apuntando un fallo diario sobre un cobro que SI se hizo —esta linea va
  // despues de todo lo demas—. Ese aviso falso es peor que no tener red aqui:
  // un fallo que sale todos los dias se aprende a despachar sin leer, y el
  // dia que el cobro falle de verdad nadie lo mira. El grueso lo hace el
  // reloj de diez minutos, que no tiene prisa.
  let llamadas: unknown = null;
  try {
    llamadas = await rescatarLlamadasSinCerrar({ limite: TOPE_EN_LA_VUELTA_DIARIA });
  } catch (e) {
    llamadas = { error: e instanceof Error ? e.message : String(e) };
  }

  // Lo que se vació de la columna de Perdido de un embudo y ya pasó de sus 30
  // días. En su propio `try`, como los demas: un barrido que se cuelgue no
  // puede tumbar el cobro. Y va acotado por vuelta, que es lo que pide el tope
  // de 20 s con el que el backend llama a esta ruta.
  let papeleraDeEmbudos: unknown = null;
  try {
    papeleraDeEmbudos = await runPapeleraDeEmbudos();
  } catch (e) {
    papeleraDeEmbudos = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json(
    {
      ...result,
      resellerBilling,
      purgaCuentas,
      podaRevisiones,
      cobros,
      vencimientos,
      grabaciones,
      llamadas,
      papeleraDeEmbudos,
    },
    { status: result.success ? 200 : 500 },
  );
}

export async function GET(request: Request) {
  return POST(request);
}
