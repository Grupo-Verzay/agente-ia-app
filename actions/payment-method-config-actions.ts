"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type AccountField = { label: string; value: string };

export type PaymentMethodConfigItem = {
  id: string;
  method: string;
  label: string;
  icon: string | null;
  isActive: boolean;
  instructions: string | null;
  accountFields: AccountField[];
  order: number;
};

export async function getAllPaymentMethodConfigs() {
  try {
    const configs = await db.paymentMethodConfig.findMany({
      orderBy: { order: "asc" },
    });
    return {
      success: true,
      data: configs.map((c) => ({
        ...c,
        accountFields: (c.accountFields as AccountField[]) ?? [],
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
      orderBy: { order: "asc" },
    });
    return {
      success: true,
      data: configs.map((c) => ({
        ...c,
        accountFields: (c.accountFields as AccountField[]) ?? [],
      })) as PaymentMethodConfigItem[],
    };
  } catch {
    return { success: false, data: [] as PaymentMethodConfigItem[] };
  }
}

export async function savePaymentMethodConfig(data: {
  id?: string;
  method: string;
  label: string;
  icon?: string;
  isActive: boolean;
  instructions: string;
  accountFields: AccountField[];
  order?: number;
}) {
  try {
    const payload = {
      label: data.label,
      icon: data.icon ?? null,
      isActive: data.isActive,
      instructions: data.instructions,
      accountFields: data.accountFields,
    };

    if (data.id) {
      await db.paymentMethodConfig.update({
        where: { id: data.id },
        data: payload,
      });
    } else {
      const maxOrder = await db.paymentMethodConfig.aggregate({ _max: { order: true } });
      await db.paymentMethodConfig.create({
        data: {
          method: data.method,
          order: (maxOrder._max.order ?? 0) + 1,
          ...payload,
        },
      });
    }
    revalidatePath("/planes");
    return { success: true, message: "Método de pago guardado" };
  } catch {
    return { success: false, message: "Error al guardar el método de pago" };
  }
}

export async function deletePaymentMethodConfig(id: string) {
  try {
    await db.paymentMethodConfig.delete({ where: { id } });
    revalidatePath("/planes");
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function reorderPaymentMethods(ids: string[]) {
  try {
    await Promise.all(
      ids.map((id, index) =>
        db.paymentMethodConfig.update({ where: { id }, data: { order: index } })
      )
    );
    return { success: true };
  } catch {
    return { success: false };
  }
}
