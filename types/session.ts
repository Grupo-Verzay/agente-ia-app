import type {
  Prisma,
  LeadStatus as PrismaLeadStatus,
  Registro as PrismaRegistro,
  TipoRegistro as PrismaTipoRegistro,
  Session as PrismaSession,
} from "@prisma/client";

export interface SessionsContentProps {
  userId: string;
  allTags: SimpleTag[];
}

/* ===== TAGS ===== */

export type SimpleTag = {
  id: number;
  name: string;
  slug: string;             // obligatorio para ser consistente
  color?: string | null;
  order: number;
};

export type LeadStatus = PrismaLeadStatus;

export type CrmFollowUpStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "CANCELLED"
  | "SKIPPED";

export type SessionCrmFollowUpHistoryItem = {
  id: string;
  status: CrmFollowUpStatus;
  leadStatusSnapshot: LeadStatus;
  attemptCount: number;
  message: string | null;
  errorReason: string | null;
  scheduledFor: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SessionCrmFollowUpSummary = {
  total: number;
  active: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  cancelled: number;
  skipped: number;
  latestStatus: CrmFollowUpStatus | null;
  latestGeneratedMessage: string | null;
  latestScheduledFor: string | null;
  recentItems: SessionCrmFollowUpHistoryItem[];
};

/* ===== SESSION (EXTENDIENDO PRISMA) ===== */

export type Session = PrismaSession & {
  tags?: SimpleTag[];
  crmFollowUpSummary?: SessionCrmFollowUpSummary | null;
  pendingSeguimientos?: number;
};

export type ChatContactDescriptor = {
  remoteJid: string;
  remoteJidAlt?: string | null;
  senderPn?: string | null;
  pushName?: string | null;
  aliases?: string[];
};

export type ChatContactSessionSummary = {
  id: number;
  userId: string;
  remoteJid: string;
  remoteJidAlt?: string | null;
  pushName?: string | null;
  tags: SimpleTag[];
  leadStatus?: LeadStatus | null;
  flujos?: string | null;
  pendingSeguimientos?: number;
  seguimientosTipos?: string[];
};

export type ChatContactSessionMap = Record<string, ChatContactSessionSummary>;

/* ===== RESPUESTAS GENÉRICAS ===== */

export type SessionResponse<T> = {
  success: boolean;
  message: string;
  data?: T;
};

// Ejemplos de alias:
export type SessionsListResponse = SessionResponse<Session[]>;
export type SingleSessionResponse = SessionResponse<Session>;
export type SessionResponseCrm = SessionResponse<SessionWithRegistrosAndTags[]>;

/* ===== TIPOS ALINEADOS A PRISMA ===== */

export type TipoRegistro = PrismaTipoRegistro;

// Sesión con registros (sin tocar todavía tags simplificados)
export type SessionWithRegistros = Session & {
  registros: PrismaRegistro[];
};

// Tipo exacto que devuelve Prisma con include { registros, sessionTags: { tag } }

export type PrismaSessionWithRegistrosAndTags = Prisma.SessionGetPayload<{
  include: {
    registros: true;
    sessionTags: {
      include: {
        tag: true;
      };
    };
  };
}>;

// Nuestro tipo final para el CRM:
// - Mantiene todo lo que Prisma devuelve
// - Pero transformamos "sessionTags" a SimpleTag[]
export type SessionWithRegistrosAndTags =
  Omit<PrismaSessionWithRegistrosAndTags, "sessionTags"> & {
    tags: SimpleTag[];
  };

// Solo defínelo así si REALMENTE incluyes la sesión
export type RegistroWithSession = PrismaRegistro & {
  session: Session;
};
