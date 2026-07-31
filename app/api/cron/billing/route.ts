import { runBillingDailyJobSystem } from "@/actions/billing/billing-job-actions";
import { runResellerBillingForAll } from "@/actions/billing/reseller-billing-actions";
import { purgarCuentasEliminadasPendientes } from "@/lib/purge-account.server";
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

  return NextResponse.json({ ...result, resellerBilling, purgaCuentas }, { status: result.success ? 200 : 500 });
}

export async function GET(request: Request) {
  return POST(request);
}
