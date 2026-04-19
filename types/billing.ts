export const SOON_DAYS_BILLING = 3;
export const OVERDUE_DAYS_BILLING = 3;

/**
 * Formato estándar de respuesta (backend)
 */
export interface ResponseFormat<T> {
    success: boolean;
    message: string;
    data?: T;
}

export type BillingTemplateType =
    | "REMINDER_3D"
    | "DUE_TODAY"
    | "EXPIRED"
    | "STATUS_ACTIVE"
    | "STATUS_PENDING"
    | "STATUS_SUSPENDED";

// ------- Types (mantenerlo simple para no tocar tus types existentes)
export type BillingStatus = "PAID" | "UNPAID";
export type AccessStatus = "ACTIVE" | "SUSPENDED";

/**
 * Tipos de entrada (sin Zod por ahora para no meter dependencias extra aquí)
 */
// /types/billing.ts

export type BillingUpsertInput = {
    userId: string;

    // billing existente
    price?: string | number | null;
    currencyCode?: string | null;
    paymentMethodLabel?: string | null;
    paymentNotes?: string | null;
    dueDate?: string | Date | null;
    billingStatus?: "PAID" | "UNPAID";
    accessStatus?: "ACTIVE" | "SUSPENDED";
    graceDays?: number | null;
    licenseDays?: number | null;
    suspendedReason?: string | null;

    serviceName?: string | null;        // Servicio
    notifyRemoteJid?: string | null;    // remoteJid destino notificación
    serviceStartAt?: string | Date | null; // fecha inicio (si quieres setearla)
    serviceEndsAt?: string | Date | null;  // fin del ciclo actual (para días restantes)
};

export type UserBilling = {
    id: string;
    userId: string;
    price: string | null;
    currencyCode: string;
    paymentMethodLabel: string | null;
    paymentNotes: string | null;
    dueDate: string | Date | null;
    billingStatus: BillingStatus;
    accessStatus: AccessStatus;
    suspendedAt: string | Date | null;
    suspendedReason: string | null;
    lastPaymentAt: string | Date | null;
    lastReminderAt: string | Date | null;
    lastReminderDueDate: string | Date | null;
    graceDays: number;
    licenseDays: number;

    serviceName?: string | null;
    notifyRemoteJid?: string | null;
    serviceStartAt?: string | Date | null;
    serviceEndAt?: string | Date | null;
    serviceEndsAt?: string | Date | null;
};

export type ClientRow = {
    id: string;
    name: string | null;
    email: string;
    role: string;
    company: string;
    notificationNumber: string;
    plan: string;
    createdAt: string | Date;
    status: boolean;
    billing?: UserBilling | null;
};

export type BillingEditForm = {
    dueDate: string;
    price: any;
    currencyCode: string;
    paymentMethodLabel: string;
    paymentNotes: string;
    graceDays: string;
    licenseDays: string;
    serviceName: string;
    notifyRemoteJid: string;
    serviceStartAt: string;
    serviceEndsAt: string;
};

export type EditDialogState = {
    open: boolean;
    loading: boolean;
    user: ClientRow | null;
    form: BillingEditForm;

    original?: BillingEditForm;
};


export const emptyDialog: EditDialogState = {
  open: false,
  loading: false,
  user: null,
  form: {
    dueDate: "",
    price: "",
    currencyCode: "COP",
    paymentMethodLabel: "",
    paymentNotes: "",
    graceDays: "0",
    licenseDays: "30",
    serviceName: "",
    notifyRemoteJid: "",
    serviceStartAt: "",
    serviceEndsAt: "",
  },
  original: undefined, 
};
