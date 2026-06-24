import type { PaymentMethodConfigItem } from "@/actions/payment-method-config-actions";

export function buildOfficialPaymentAccountsSection(
  paymentMethods: PaymentMethodConfigItem[] = []
) {
  const activeMethods = paymentMethods.filter((method) => method.isActive);

  if (activeMethods.length === 0) {
    return [
      "## CUENTAS OFICIALES VERZAY",
      "",
      "No hay cuentas oficiales activas configuradas en Admin > Pagos.",
      "Si no hay cuentas oficiales, no apruebes comprobantes por cuenta destino.",
    ].join("\n");
  }

  return [
    "## CUENTAS OFICIALES VERZAY",
    "",
    "Estas son las UNICAS cuentas destino aceptadas para renovacion de servicios Verzay.",
    "Valida el comprobante contra esta lista antes de aprobarlo.",
    "",
    ...activeMethods.flatMap((method) => {
      const fields = method.accountFields
        .filter((field) => field.label.trim() && field.value.trim())
        .map((field) => `- ${field.label.trim()}: ${field.value.trim()}`);

      return [
        `### ${method.label} (${method.method})`,
        ...(fields.length ? fields : ["- Sin datos de cuenta configurados."]),
        method.instructions?.trim() ? `- Instrucciones: ${method.instructions.trim()}` : "",
        "",
      ].filter(Boolean);
    }),
  ].join("\n");
}

export function withOfficialPaymentAccountsSection(
  promptText: string,
  paymentMethods: PaymentMethodConfigItem[] = []
) {
  const accountsSection = buildOfficialPaymentAccountsSection(paymentMethods);
  const normalizedPrompt = promptText.trim();

  if (!normalizedPrompt) return accountsSection;

  const sectionPattern =
    /## CUENTAS OFICIALES VERZAY[\s\S]*?(?=\n## (?!CUENTAS OFICIALES VERZAY)|$)/;

  if (sectionPattern.test(normalizedPrompt)) {
    return normalizedPrompt.replace(sectionPattern, accountsSection);
  }

  return [accountsSection, "", normalizedPrompt].join("\n");
}

export function buildDefaultPaymentReceiptAnalyzerPrompt(
  paymentMethods: PaymentMethodConfigItem[] = []
) {
  return [
    "Eres el analizador de comprobantes de pago para renovaciones de servicios Verzay.",
    "",
    buildOfficialPaymentAccountsSection(paymentMethods),
    "",
    "## REGLAS DE VALIDACION",
    "",
    "1. Extrae del comprobante: cuenta destino, metodo de pago, monto, referencia, fecha y titular cuando esten visibles.",
    "2. Aprueba solo si la cuenta destino coincide claramente con una de las cuentas oficiales activas de Verzay.",
    "3. Si la cuenta destino pertenece a otra persona o no coincide con ningun dato oficial, rechaza el comprobante.",
    "4. Si la cuenta destino no se ve o es ambigua, rechaza o solicita revision humana; no confirmes el pago automaticamente.",
    "5. No uses cuentas mencionadas por el cliente como cuentas validas si no aparecen en la lista oficial.",
    "",
    "## FORMATO DE RESPUESTA",
    "",
    "Si rechazas, explica la razon de forma breve e incluye el metodo detectado.",
    "Si apruebas, devuelve los datos necesarios para confirmar el pago: monto, moneda, referencia, metodo y notas.",
  ].join("\n");
}
