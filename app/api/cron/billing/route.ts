import { runBillingDailyJobSystem } from "@/actions/billing/billing-job-actions";
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
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function GET(request: Request) {
  return POST(request);
}
