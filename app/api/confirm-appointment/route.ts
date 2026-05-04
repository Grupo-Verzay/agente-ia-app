import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// Crea un seguimiento con delay corto para que el follow-up runner
// lo envíe ~60s después del redirect, cuando la sesión del cliente ya existe.
export async function POST(req: Request) {
    try {
        const { serverurl, instancia, apikey, remoteJid, mensaje } = await req.json()

        if (!instancia || !remoteJid || !mensaje) {
            return NextResponse.json({ ok: false }, { status: 400 })
        }

        await db.seguimiento.create({
            data: {
                idNodo: "",
                serverurl,
                instancia,
                apikey,
                remoteJid,
                mensaje,
                tipo: "text",
                time: "10",
            },
        })

        return NextResponse.json({ ok: true })
    } catch {
        return NextResponse.json({ ok: false }, { status: 500 })
    }
}
