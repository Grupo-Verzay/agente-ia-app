export type ChatConversationPreference = {
  // La linea a la que pertenece la marca. Vacia = de antes de que la tabla
  // guardara la linea; vale para todas las de la cuenta.
  instanceName: string;
  remoteJid: string;
  pinnedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  purgedAt: string | null;
  // Cuando se escribio esta fila. Es lo que decide cual manda cuando un mismo
  // contacto tiene marcas bajo varias identidades (ver `elegirPreferenciaDelChat`).
  updatedAt: string | null;
  isPinned: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  // Ya se limpio su rastro: sigue eliminado (y por tanto oculto), pero no
  // hace falta seguir listandolo en la pestana Eliminados.
  isPurged: boolean;
};

export type ChatConversationPreferenceMap = Record<string, ChatConversationPreference>;

export type ChatWorkflowOption = {
  id: string;
  name: string;
  isPro: boolean;
  /** La cuenta dueña (ver `lib/atajos-de-la-linea.ts`). Filtra el panel de Atajos. */
  cuentaId: string;
};

export type ChatQuickReplyOption = {
  id: number;
  name: string | null;
  message: string;
  category: string;
  workflowId: string | null;
  workflowName: string | null;
  /** La cuenta dueña (ver `lib/atajos-de-la-linea.ts`). Filtra el panel de Atajos. */
  cuentaId: string;
  /** Si es de la cuenta, de quien mira o de otro asesor (`lib/personales.ts`). */
  grupo?: "mias" | "de-asesores" | "de-la-cuenta";
};

export type ChatToolActionResult =
  | {
      success: true;
      message: string;
      data?: {
        sentCount?: number;
        skippedCount?: number;
      };
    }
  | {
      success: false;
      message: string;
    };
