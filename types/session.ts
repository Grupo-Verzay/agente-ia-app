import type {
  Prisma,
  AppointmentStatus,
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

// ServiceType: tipo de servicio contratado por el contacto con el negocio
export type ServiceType = 'IA' | 'HUMANO';

// ClientStatus: estado del cliente en la plataforma
export type ClientStatus = 'ACTIVO' | 'INACTIVO';

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
  adSource?: { title?: string; body?: string; sourceUrl?: string } | null;
  adSourceAt?: Date | null;
};

export type ChatContactDescriptor = {
  remoteJid: string;
  remoteJidAlt?: string | null;
  senderPn?: string | null;
  pushName?: string | null;
  aliases?: string[];
  /**
   * Linea (Instancia) de la que viene este chat. Un mismo numero puede
   * escribirle a mas de una linea de la cuenta, cada una con su propia
   * Session (asesor asignado, etiquetas...) para ese contacto. Sirve para
   * que getChatContactSessions no mezcle la sesion de una linea con la de
   * otra al elegir "la" sesion de un contacto.
   */
  instanceName?: string | null;
};

export type ChatContactSessionSummary = {
  id: number;
  userId: string;
  remoteJid: string;
  remoteJidAlt?: string | null;
  customName?: string | null;
  pushName?: string | null;
  tags: SimpleTag[];
  leadStatus?: LeadStatus | null;
  serviceType?: ServiceType | null;
  clientStatus?: ClientStatus | null;
  flujos?: string | null;
  pendingSeguimientos?: number;
  seguimientosTipos?: { tipo: string; count: number }[];
  latestAppointmentStatus?: AppointmentStatus | null;
  // Recordatorios pendientes de este contacto. Los que ya sonaron se borran (o
  // avanzan a su próxima fecha si se repiten), así que cada fila es uno vivo.
  reminderCount?: number;
  assignedAdvisorId?: string | null;
  status?: boolean;
  agentDisabled?: boolean;
  /**
   * Cuando se marco como resuelta (milisegundos), o null si no lo esta.
   *
   * Va aparte de `status` a proposito: ese se apaga tambien cuando un asesor
   * responde, para callar a la IA, y usarlo como "resuelta" sacaba de la lista
   * cualquier chat contestado.
   */
  resolvedAt?: number | null;
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
