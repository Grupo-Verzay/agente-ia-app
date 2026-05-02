import { runWeeklyReportForAllUsers } from "@/actions/weekly-report-actions";
import { NextResponse } from "next/server";

function isAuthorized(request: Request): boolean {
    const expected = (process.env.CRON_SECRET ?? "").trim();
    if (!expected) return false;
    const bearer = request.headers.get("authorization");
    const secret = bearer?.startsWith("Bearer ")
        ? bearer.slice(7).trim()
        : (request.headers.get("x-cron-secret") ?? "").trim();
    return secret === expected;
}

export async function POST(request: Request) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ success: false, message: "CRON_SECRET no configurado." }, { status: 500 });
    }
    if (!isAuthorized(request)) {
        return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
    }

    const result = await runWeeklyReportForAllUsers();
    return NextResponse.json(result, { status: 200 });
}

export async function GET(request: Request) {
    return POST(request);
}
