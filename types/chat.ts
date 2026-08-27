export type ChatConversationPreference = {
  remoteJid: string;
  pinnedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  purgedAt: string | null;
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
};

export type ChatQuickReplyOption = {
  id: number;
  name: string | null;
  message: string;
  category: string;
  workflowId: string | null;
  workflowName: string | null;
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
