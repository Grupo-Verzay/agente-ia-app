"use server";

import { db } from "@/lib/db";
import { PaymentMethodType } from "@prisma/client";
import { revalidatePath } from "next/cache";

export type PaymentMethodConfigItem = {
  id: string;
  method: PaymentMethodType;
  label: string;
  isActive: boolean;
  instructions: string | null;
  accountInfo: Record<string, string>;
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  WOMPI: "Wompi",
  NEQUI: "Nequi",
  BANCOLOMBIA: "Bancolombia",
  BINANCE: "Binance",
  ZELLE: "Zelle",
  PAGO_MOVIL: "Pago Móvil",
};

export async function getAllPaymentMethodConfigs() {
  try {
    const configs = await db.paymentMethodConfig.findMany({
      orderBy: { method: "asc" },
    });
    return {
      success: true,
      data: configs.map((c) => ({
        ...c,
        accountInfo: c.accountInfo as Record<string, string>,
      })) as PaymentMethodConfigItem[],
    };
  } catch {
    return { success: false, data: [] as PaymentMethodConfigItem[] };
  }
}

export async function getActivePaymentMethodConfigs() {
  try {
    const configs = await db.paymentMethodConfig.findMany({
      where: { isActive: true },
      orderBy: { method: "asc" },
    });
    return {
      success: true,
      data: configs.map((c) => ({
        ...c,
        accountInfo: c.accountInfo as Record<string, string>,
      })) as PaymentMethodConfigItem[],
    };
  } catch {
    return { success: false, data: [] as PaymentMethodConfigItem[] };
  }
}

export async function upsertPaymentMethodConfig(data: {
  method: PaymentMethodType;
  label: string;
  isActive: boolean;
  instructions: string;
  accountInfo: Record<string, string>;
}) {
  try {
    await db.paymentMethodConfig.upsert({
      where: { method: data.method },
      update: {
        label: data.label,
        isActive: data.isActive,
        instructions: data.instructions,
        accountInfo: data.accountInfo,
      },
      create: {
        method: data.method,
        label: data.label,
        isActive: data.isActive,
        instructions: data.instructions,
        accountInfo: data.accountInfo,
      },
    });
    revalidatePath("/planes");
    return { success: true, message: "Método de pago guardado" };
  } catch {
    return { success: false, message: "Error al guardar el método de pago" };
  }
}
