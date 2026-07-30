"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Tasa USD → COP con la que se factura.
 *
 * Los planes se publican en USD porque es la referencia con la que se compara
 * el mercado, pero el dinero entra en pesos: Wompi es una pasarela colombiana.
 * Sin una tasa guardada, la cuenta quedaba facturada en USD y el comprobante
 * llegaba en COP; como la validación de monto exige que la moneda coincida,
 * ningún pago renovaba solo.
 *
 * Vacío = no convertir. Es el comportamiento de siempre, así que quien no la
 * configure no ve ningún cambio.
 */

export async function getUsdToCopRate(): Promise<number | null> {
  try {
    const c = await db.siteConfig.findUnique({
      where: { id: 1 },
      select: { usdToCopRate: true },
    });
    const tasa = Number(c?.usdToCopRate ?? 0);
    return Number.isFinite(tasa) && tasa > 0 ? tasa : null;
  } catch {
    return null;
  }
}

export async function saveUsdToCopRate(
  rate: number | null,
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await currentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return { success: false, message: "No autorizado" };
    }

    if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
      return { success: false, message: "La tasa debe ser un número mayor que cero." };
    }

    const payload = { usdToCopRate: rate };
    await db.siteConfig.upsert({
      where: { id: 1 },
      update: payload,
      create: { id: 1, ...payload },
    });

    revalidatePath("/admin/planes");
    return {
      success: true,
      message: rate === null
        ? "Tasa borrada: las cuentas nuevas se facturan en la moneda de referencia."
        : `Tasa guardada: 1 USD = ${rate.toLocaleString("es-CO")} COP.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
  }
}
