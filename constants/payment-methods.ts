export const PAYMENT_METHOD_LABELS = {
  WOMPI: "Wompi",
  NEQUI: "Nequi",
  BANCOLOMBIA: "Bancolombia",
  BINANCE: "Binance",
  ZELLE: "Zelle",
  PAGO_MOVIL: "Pago Móvil",
} as const;

export type PaymentMethodKey = keyof typeof PAYMENT_METHOD_LABELS;

export const ALL_PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodKey[];

export const ACCOUNT_INFO_FIELDS: Record<PaymentMethodKey, { key: string; label: string }[]> = {
  WOMPI:       [{ key: "publicKey", label: "Llave pública (pub_test/pub_prod)" }, { key: "redirectUrl", label: "URL de redirección" }],
  NEQUI:       [{ key: "phone", label: "Número Nequi" }, { key: "name", label: "Nombre titular" }],
  BANCOLOMBIA: [{ key: "accountType", label: "Tipo de cuenta" }, { key: "accountNumber", label: "Número de cuenta" }, { key: "name", label: "Nombre titular" }],
  BINANCE:     [{ key: "uid", label: "UID Binance" }, { key: "name", label: "Nombre" }],
  ZELLE:       [{ key: "email", label: "Email Zelle" }, { key: "name", label: "Nombre" }],
  PAGO_MOVIL:  [{ key: "phone", label: "Número" }, { key: "bank", label: "Banco" }, { key: "name", label: "Nombre titular" }],
};
