import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

import { guardOwnerRequest } from "@/lib/owner-command-auth";
import { consultar, preparar, type Fallo, type QuienOrdena } from "@/lib/motor-del-dueno.server";

/**
 * Lo común de las rutas `/api/owner/*`: secreto + identidad (`guardOwnerRequest`)
 * y después el MOTOR. Ninguna ruta ejecuta una acción: o consulta, o prepara.
 */

function fallo(f: Fallo) {
  return NextResponse.json(
    {
      success: false,
      message: f.message,
      ...(f.fueraDelPlan ? { fueraDelPlan: true } : {}),
      ...(f.requiereVerificacion ? { requiereVerificacion: true } : {}),
    },
    { status: f.status },
  );
}

/** Una consulta de solo lectura: plan + bitácora, y los datos. */
export async function rutaDeConsulta<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  herramienta: string,
  hacer: (quien: QuienOrdena, body: z.infer<T>) => Promise<Record<string, unknown>>,
) {
  const guard = await guardOwnerRequest(request, schema);
  if (!guard.ok) return guard.response;
  try {
    const { userId, ownerPhone, canal, pedido, ...args } = guard.body as Record<string, unknown>;
    void userId; void ownerPhone; void canal; void pedido;
    const r = await consultar(guard.quien, herramienta, args, () => hacer(guard.quien, guard.body));
    if (!r.ok) return fallo(r);
    if ((r.datos as { ok?: unknown }).ok === false) {
      const e = r.datos as { status?: number; message?: string };
      return NextResponse.json({ success: false, message: e.message ?? "No se pudo consultar." }, { status: e.status ?? 500 });
    }
    return NextResponse.json({ success: true, ...r.datos }, { status: 200 });
  } catch (error) {
    console.error(`[/api/owner ${herramienta}]`, error);
    return NextResponse.json({ success: false, message: "No se pudo consultar." }, { status: 500 });
  }
}

/**
 * Una acción: se PREPARA y se devuelve el texto exacto a confirmar (202). Se
 * ejecuta solo con el «sí» de la persona (`/api/owner/turn`). Un
 * `confirmed: true` en el cuerpo ya no ejecuta nada: confirmar no es un campo
 * que el que llama pueda poner, es una respuesta de la persona.
 */
export async function rutaDeAccion<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  herramienta: string,
  args: (body: z.infer<T>) => Record<string, unknown>,
) {
  const guard = await guardOwnerRequest(request, schema);
  if (!guard.ok) return guard.response;
  try {
    const r = await preparar(guard.quien, herramienta, args(guard.body));
    if (!r.ok) return fallo(r);
    return NextResponse.json(
      {
        success: true,
        pendiente: true,
        accionId: r.accionId,
        confirmacion: r.confirmacion,
        irreversible: r.irreversible,
        message: "Acción preparada: falta que la persona la confirme.",
      },
      { status: 202 },
    );
  } catch (error) {
    console.error(`[/api/owner ${herramienta}]`, error);
    return NextResponse.json({ success: false, message: "No se pudo preparar la acción." }, { status: 500 });
  }
}
