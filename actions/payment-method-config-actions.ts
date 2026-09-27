"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { quienMandaEnLaCasa } from "@/lib/puerta-de-la-casa";

// Las cuentas bancarias y métodos a los que paga TODA la plataforma. Las lee y
// las cambia la casa (`lib/mando-de-la-casa.ts`) y nadie más: antes cualquiera
// con sesión podía cambiar el número de cuenta al que pagan los clientes.
//
// La única lectura abierta es `getActivePaymentMethodConfigs`, a propósito: es
// lo que ve un cliente para saber dónde pagar (/planes). Solo lo ACTIVO.

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
    if (!(await quienMandaEnLaCasa("getAllPaymentMethodConfigs"))) {
      return { success: false, data: [] as PaymentMethodConfigItem[] };
    }
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
    if (!(await quienMandaEnLaCasa("savePaymentMethodConfig"))) {
      return { success: false, message: "No autorizado" };
    }
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
    if (!(await quienMandaEnLaCasa("deletePaymentMethodConfig"))) return { success: false };
    await db.paymentMethodConfig.delete({ where: { id } });
    revalidatePath("/planes");
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function reorderPaymentMethods(ids: string[]) {
  try {
    if (!(await quienMandaEnLaCasa("reorderPaymentMethods"))) return { success: false };
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
