'use client';

import type { ConexionContacto, PresenciaContacto } from "@/hooks/chats/useChatsRealtime";
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CompartirConElEquipo } from "@/components/chat-equipo/CompartirConElEquipo";
import { AlarmClockOff, ArrowRight, Bot, ClipboardList, Megaphone, PanelRightClose, PanelRightOpen, PencilLine, Pin, CheckCircle, LogOut, ChevronDown, RotateCcw, UserPlus, UserRound, Share2, SquarePen, Search, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SwitchStatus } from '../../sessions/_components/SwitchStatus';
import { initialFromName } from './chat-message-utils';
import type { ChatHeader as ChatHeaderData } from './chat-message-types';
import type { Session, SimpleTag } from '@/types/session';
import type { AdvisorInfo } from '@/actions/team-actions';
import { AdvisorAssignBadge } from './AdvisorAssignBadge';
import { MacrosMenu } from './MacrosMenu';
import { SessionTagsCombobox } from '../../tags/components/SessionTagsCombobox';
import { etiquetasDeLaConversacion } from "@/lib/etiquetas-de-la-linea";
import { LeadStatusSelect } from './LeadStatusSelect';
import { reopenSession, resolveSession } from '@/actions/advisor-assign-actions';
import { addSessionParticipantAction } from '@/actions/collab-actions';
import { devolverChatALaIaAction, quitarDeEsperaAction } from '@/actions/advisor-assign-actions';
import { PestanasDelChat } from './PestanasDelChat';
import { ChatRegistrosBadge } from './ChatRegistrosBadge';
import { LeadContextSheet } from './LeadContextSheet';
import { MenuDeLlamada } from '@/components/chats/MenuDeLlamada';
import { ChatAppointmentStatusButton } from './ChatAppointmentStatusButton';
import { ChatReminderDialog } from './ChatReminderDialog';
import { TaskFormDialog } from './TaskFormDialog';
import { MergeLidDialog } from './MergeLidDialog';
import { deleteLidChat } from '@/actions/merge-lid-contact';
import { cn } from '@/lib/utils';
import { CABECERA_ESCRITORIO, CLASE_FILA_1, CLASE_FILA_2 } from '@/lib/cabeceras-de-chats';
import { MARCA_DE_LA_CABECERA, usePanelFlotante } from '@/hooks/usePanelFlotante';
import { PANEL_QUE_SE_DESPLAZA } from '@/lib/paneles-flotantes';
import { isLidJid } from '@/lib/whatsapp-jid';
import { useModuleStore } from '@/stores/modules/useModuleStore';

/*
 * El margen de la cabecera (16 px a los cuatro lados), el alto (110 px) y el de
 * cada fila viven en `lib/cabeceras-de-chats.ts`: los comparte la cabecera de la
 * columna de chats, y con los números escritos aquí el día que se afine uno el
 * otro se queda atrás.
 */

// Avisos de "@lid" que el usuario ya cerró, por chat. Muchos contactos usan un
// WhatsApp sin número visible (cuenta por nombre de usuario) y su @lid no es un
// duplicado de nadie: no hay con qué unirlo. En esos, el aviso es ruido fijo, así
// que se puede cerrar y no vuelve a salir EN ESE chat. En los @lid nuevos sí
// sigue apareciendo, por si alguno sí es un duplicado que conviene unir.
const LID_AVISO_KEY = 'lid_aviso_oculto_v1';
function avisosLidOcultos(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try { return new Set(JSON.parse(window.localStorage.getItem(LID_AVISO_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}
function ocultarAvisoLid(jid: string): void {
  try {
    const s = avisosLidOcultos(); s.add(jid);
    // Tope generoso: una entrada por chat cerrado, y nada la borra.
    window.localStorage.setItem(LID_AVISO_KEY, JSON.stringify(Array.from(s).slice(-2000)));
  } catch {}
}

const PALETTE = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-cyan-500','bg-fuchsia-500'];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(a: AdvisorInfo) {
  const name = a.name?.trim() || a.email;
  const parts = name.split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

/**
 * "hoy a las 10:41", "ayer a las 22:03", "el 5/9 a las 09:12". Igual que
 * WhatsApp: la hora solo dice algo si se sabe el dia.
 */
function ultimaVezTexto(lastSeenSegundos: number): string {
  const fecha = new Date(lastSeenSegundos * 1000);
  const hora = fecha.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  const hoy = new Date();
  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(fecha, hoy)) return `hoy a las ${hora}`;
  if (mismoDia(fecha, ayer)) return `ayer a las ${hora}`;
  return `el ${fecha.getDate()}/${fecha.getMonth() + 1} a las ${hora}`;
}

interface ChatHeaderProps {
  header: ChatHeaderData;
  /** El contacto esta escribiendo o grabando un audio ahora mismo. */
  presencia?: PresenciaContacto | null;
  /** Si el contacto esta conectado, y cuando se vio por ultima vez (segundos). */
  conexion?: { estado: ConexionContacto; lastSeen: number | null } | null;
  session: Session | null;
  userId: string;
  allTags: SimpleTag[];
  displayedContactName: string;
  displayedWhatsapp: string;
  instanceType?: string;
  instanceName?: string;
  remoteJid?: string;
  /**
   * Todas las identidades conocidas del contacto.
   *
   * Para compartir la conversación con el equipo: la lista lo devuelve por la
   * que Evolution dé esa vuelta, así que guardar solo una es la forma de que
   * después no se encuentre. Es la misma regla con la que se piden los
   * mensajes.
   */
  identidadesDelChat?: string[];
  onBackToList: () => void;
  onOpenContactEditor: () => void;
  onSessionTagsChange?: (remoteJid: string, selectedIds: number[]) => void;
  onSessionMutate: () => void;
  /** El interruptor de la IA cambio: para pintarlo al momento en la lista. */
  onSessionStatusChange?: (status: boolean) => void;
  onSessionRefresh: () => Promise<void>;
  advisors?: AdvisorInfo[];
  currentAdvisorId?: string;
  advisorRole?: string | null;
  assignedAdvisorId?: string | null;
  /** Cuando se marco como resuelta (ms), o null si sigue abierta. */
  resolvedAt?: number | null;
  /** Desde cuando espera a una persona (ms), o null si no esta en espera. */
  escalatedAt?: number | null;
  /** Aviso de que se reabrio, para que la lista la saque de "Resueltos". */
  onSessionReopened?: () => void;
  /**
   * Se quito de «En espera»: quitar el sello en memoria para que el conteo baje
   * al momento. Trae el id de la sesion para tocar TODAS sus llaves.
   */
  onUnescalated?: (sessionId: number) => void;
  onAssignAdvisor?: (advisorId: string | null) => Promise<void>;
  onNewMessage?: () => void;
  onRunMacro?: (macroId: string) => Promise<void>;
  infoPanelOpen?: boolean;
  onToggleInfoPanel?: () => void;
  searchOpen?: boolean;
  onToggleSearch?: () => void;
  onExpandChatList?: () => void;
  chatView?: string;
  onChatViewChange?: (view: string) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  header,
  presencia,
  conexion,
  session,
  userId,
  allTags,
  displayedContactName,
  displayedWhatsapp,
  instanceType,
  instanceName,
  remoteJid,
  identidadesDelChat,
  onBackToList,
  onOpenContactEditor,
  onSessionTagsChange,
  onSessionMutate,
  onSessionStatusChange,
  onSessionRefresh,
  advisors,
  currentAdvisorId,
  advisorRole,
  assignedAdvisorId,
  resolvedAt,
  escalatedAt,
  onSessionReopened,
  onUnescalated,
  onAssignAdvisor,
  onNewMessage,
  onRunMacro,
  infoPanelOpen,
  onToggleInfoPanel,
  searchOpen,
  onToggleSearch,
  onExpandChatList,
  chatView,
  onChatViewChange,
}) => {
  const { userIntegrations } = useModuleStore();
  const adSource = session?.adSource as { title?: string; body?: string; sourceUrl?: string } | null | undefined;
  const adSourceLabel = adSource?.title || (adSource?.sourceUrl ? (() => { try { return new URL(adSource.sourceUrl!).hostname.replace(/^www\./, ''); } catch { return 'Anuncio'; } })() : null);

  /**
   * Si la línea de debajo del nombre ya está diciendo algo (escribiendo,
   * grabando, en línea, últ. vez), el anuncio no cabe y no se enseña.
   *
   * Antes esto era `!conexion`, y desde que la presencia funciona también en
   * las líneas de Evolution eso **escondía el anuncio siempre**: un contacto
   * desconectado sin "últ. vez" deja `conexion` puesta pero no pinta ningún
   * texto, así que la cabecera se quedaba sin lo uno y sin lo otro. Se mira lo
   * que de verdad se va a pintar, no si hay dato.
   */
  const hayLineaDeEstado = Boolean(
    presencia ||
      conexion?.estado === "en_linea" ||
      (conexion?.estado === "desconectado" && conexion.lastSeen),
  );

  const initialSelectedTagIds = session?.tags?.map((t) => t?.id).filter(Boolean) ?? [];
  const [resolving, setResolving] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  // «Acciones»: el sexto panel de la fila, y el que da nombre a la altura a la
  // que nacen todos —justo por debajo de su fila, sin taparla—.
  const panelDeAcciones = usePanelFlotante('cabecera', 'menu');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [compartirAbierto, setCompartirAbierto] = useState(false);
  const [confirmDeleteLid, setConfirmDeleteLid] = useState(false);
  const [deletingLid, setDeletingLid] = useState(false);
  // ¿El aviso de @lid de ESTE chat ya se cerró? Se relee al cambiar de chat.
  const [avisoLidOculto, setAvisoLidOculto] = useState(false);
  useEffect(() => {
    setAvisoLidOculto(!!remoteJid && avisosLidOcultos().has(remoteJid));
  }, [remoteJid]);

  const isAgent = !!advisorRole;
  const isOwnerLike = !advisorRole || advisorRole === 'administrador';
  const isMySession = !!assignedAdvisorId && currentAdvisorId === assignedAdvisorId;
  // Resolver y reabrir son la misma decision en los dos sentidos, asi que las
  // toma la misma gente. Nunca se ofrecen las dos a la vez: la conversacion o
  // esta resuelta o no lo esta.
  const estaResuelta = !!resolvedAt;
  const puedeCerrarOAbrir = !!session && (isOwnerLike || isMySession);
  const canResolve = puedeCerrarOAbrir && !estaResuelta;
  const canReopen = puedeCerrarOAbrir && estaResuelta;
  const canLiberate = isMySession;
  // «Devolver a la IA» solo se ofrece cuando hay algo que devolver: la IA esta
  // apagada en ESTA conversacion. Lo hace quien manda en ella.
  const iaPausada = Boolean(session?.agentDisabled);
  const canReturnToAi = !!session && iaPausada && (isOwnerLike || isMySession);
  const canTake = !assignedAdvisorId;
  // «Quitar de espera» solo se ofrece cuando HAY sello que quitar, y lo hace
  // quien puede tocar la conversacion —la misma puerta que resolver y reabrir—.
  // Apaga solo esa marca: no toca asignado, ni estado, ni la IA, ni resuelve, y
  // por eso la IA puede seguir atendiendo mientras tanto. Es la accion que
  // faltaba para el caso en que la IA sigue bien y ya no hay nada que esperar.
  const estaEnEspera = !!escalatedAt;
  const canUnescalate = !!session && estaEnEspera && puedeCerrarOAbrir;
  const otherAdvisors = (advisors ?? []).filter((a) => a.id !== currentAdvisorId);
  const showLifecycleButton = session && (canResolve || canReopen || canLiberate || canTake || canReturnToAi || canUnescalate);

  const handleResolve = async () => {
    if (!session?.id || resolving) return;
    setResolving(true);
    const res = await resolveSession(session.id);
    setResolving(false);
    if (!res.success) { toast.error(res.message ?? 'Error al resolver.'); return; }
    toast.success('Conversación resuelta.');
    onSessionMutate();
    await onSessionRefresh();
  };

  /**
   * Devuelve la conversacion a la bandeja.
   *
   * Faltaba el camino de vuelta: una vez resuelta se quedaba en "Resueltos"
   * salvo que el cliente volviera a escribir. "Liberar conversacion" no servia
   * -eso solo quita el asesor asignado- y por eso parecia que no hacia nada.
   *
   * No se toca el interruptor de la IA: reabrir para revisar algo no deberia
   * ponerla a contestar sin que nadie se lo pida.
   */
  const handleReopen = async () => {
    if (!session?.id || resolving) return;
    setResolving(true);
    const res = await reopenSession(session.id);
    setResolving(false);
    if (!res.success) { toast.error(res.message ?? 'Error al reabrir.'); return; }
    toast.success('Conversación reabierta.');
    onSessionReopened?.();
    onSessionMutate();
    await onSessionRefresh();
  };

  const handleTake = async () => {
    await onAssignAdvisor?.(currentAdvisorId ?? null);
  };

  const handleTransfer = async (targetId: string) => {
    await onAssignAdvisor?.(targetId);
  };

  const handleAddParticipant = async (advisorId: string) => {
    if (!session?.id) return;
    const res = await addSessionParticipantAction(session.id, advisorId);
    if (res.success) {
      toast.success(
        res.message === 'Ya es participante.'
          ? 'Ese asesor ya participa en la conversación.'
          : 'Participante agregado a la conversación.',
      );
      // Avisa al panel lateral para que actualice la lista.
      window.dispatchEvent(new Event('verzay:participants-changed'));
    } else {
      toast.error(res.message);
    }
  };

  const participantCandidates = (advisors ?? []).filter((a) => a.id !== userId);
  const puedeAgregarParticipante = !!session && participantCandidates.length > 0;

  const handleLiberate = async () => {
    await onAssignAdvisor?.(null);
  };

  /**
   * Devolver la conversacion a la IA: la enciende y suelta al asesor.
   *
   * Las dos cosas juntas a proposito. Solo encenderla deja el chat en la
   * pestaña «Mias» de alguien que ya no lo atiende; solo soltarlo deja al
   * cliente escribiendo sin que le conteste nadie.
   */
  const handleReturnToAi = async () => {
    if (!session?.id || resolving) return;
    setResolving(true);
    const res = await devolverChatALaIaAction(session.id);
    setResolving(false);
    if (!res.success) { toast.error(res.message ?? 'No se pudo devolver a la IA.'); return; }
    toast.success('Conversación devuelta a la IA.');
    onSessionMutate();
    await onSessionRefresh();
  };

  /**
   * Quitar la conversacion de «En espera», y nada mas.
   *
   * No cambia el asignado, ni el estado, ni la IA, ni resuelve: es para cuando
   * la IA sigue atendiendo bien y ya no queda nada que esperar. El sello se quita
   * en memoria al momento (`onUnescalated`) para que el conteo de «En espera»
   * baje sin esperar al reloj de sesiones.
   */
  const handleUnescalate = async () => {
    if (!session?.id || resolving) return;
    setResolving(true);
    const res = await quitarDeEsperaAction(session.id);
    setResolving(false);
    if (!res.success) { toast.error(res.message ?? 'No se pudo quitar de espera.'); return; }
    toast.success('Se quitó de espera.');
    onUnescalated?.(session.id);
    onSessionMutate();
    await onSessionRefresh();
  };

  const callDigits = (displayedWhatsapp || remoteJid || '').replace(/\D/g, '');
  // Lo que las dos formas de llamar necesitan, resuelto una vez. La LÍNEA es la
  // de la conversación abierta y viaja en las dos: `abrirLlamadaAqui` la usa
  // para el número de salida y `startBotCallAction` para la cuenta que llama y
  // para dónde se anota la burbuja (ver *la salida es la línea de la
  // CONVERSACIÓN*). Abrir la tarjeta sigue siendo cosa del anfitrión del
  // layout, no de esta cabecera, así que la llamada aguanta al cambiar de
  // conversación o de pantalla.
  const datosParaLlamar = {
    phone: callDigits,
    contactName: displayedContactName,
    instanceType,
    instanceName,
  };

  const sessionStatusTone = session?.status
    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
    : 'border-amber-300 bg-amber-100 text-amber-800';

  // Las etiquetas de la cuenta de la linea de ESTA conversacion, y ninguna
  // mas. Si esa linea no tiene etiquetas el selector sale vacio: ofrecer las
  // de otra linea serian botones que el servidor rechaza.
  const etiquetasDeEstaLinea = useMemo(
    () => etiquetasDeLaConversacion(allTags, session?.userId),
    [allTags, session?.userId],
  );

  const tagsCombobox = session && (
    <SessionTagsCombobox
      userId={session.userId}
      sessionId={session.id}
      allTags={etiquetasDeEstaLinea}
      initialSelectedIds={initialSelectedTagIds}
      onSelectedIdsChange={(selectedIds) => {
        if (!remoteJid) return;
        onSessionTagsChange?.(remoteJid, selectedIds);
      }}
      panel="cabecera"
    />
  );

  const sessionToggle = session && (
    <SwitchStatus
      key={`${session.id}-${session.status ? 'on' : 'off'}`}
      sessionId={session.id}
      checked={session.status ?? false}
      mutateSessions={onSessionMutate}
      onChanged={onSessionStatusChange}
    />
  );

  const advisorBadge = session && (advisors?.length ?? 0) > 0 && (
    <AdvisorAssignBadge
      assignedAdvisorId={assignedAdvisorId}
      advisors={advisors ?? []}
      advisorRole={advisorRole}
      currentAdvisorId={currentAdvisorId}
      sessionId={session.id}
      onAssign={onAssignAdvisor}
      size="md"
      panel="cabecera"
    />
  );

  const lifecycleButton = showLifecycleButton && (
    <DropdownMenu onOpenChange={panelDeAcciones.alAbrir}>
      <DropdownMenuTrigger asChild ref={panelDeAcciones.disparador}>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 gap-1.5 px-2.5 text-sm"
          disabled={resolving}
        >
          Acciones
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      {/* Al filo derecho del área de conversación y a la misma altura que los
          otros cinco. El tope y el scroll son los de siempre, puestos ahora en
          un solo sitio. */}
      <DropdownMenuContent
        {...panelDeAcciones.props}
        className={cn('w-52 p-1', PANEL_QUE_SE_DESPLAZA)}
      >
        {onNewMessage && (
          <>
            <DropdownMenuItem
              onSelect={onNewMessage}
              className="flex items-center gap-2 cursor-pointer"
            >
              <SquarePen className="h-3.5 w-3.5 shrink-0" />
              Nuevo mensaje
            </DropdownMenuItem>
            <div className="my-1 border-t border-border/50" />
          </>
        )}
        {/* Tomar — para agentes/admins cuando la sesión está sin asignar */}
        {canTake && (
          <DropdownMenuItem
            onSelect={() => void handleTake()}
            className="flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5 shrink-0" />
            Tomar conversación
          </DropdownMenuItem>
        )}

        {/*
         * Transferir y Agregar participante van PLEGADOS, cada uno en su
         * submenú.
         *
         * Estaban abiertos, uno detrás de otro: con varios asesores el menú se
         * llenaba de nombres —dos veces, una por lista— y Resolver quedaba tan
         * abajo que no se llegaba. Y eso es justo lo que más se usa: transferir
         * y sumar gente son de vez en cuando; cerrar la conversación es cada
         * día.
         *
         * La regla, si se añade otra lista aquí: **lo que hace el asesor a
         * diario se ve sin desplegar nada**. Las listas que crecen con el
         * equipo van dentro de un submenú, con su propio scroll.
         */}
        {canTake && (canLiberate || canResolve || canReopen || canUnescalate || puedeAgregarParticipante) && (
          <div className="my-1 border-t border-border/50" />
        )}

        {/* Enviar al equipo.
          *
          * Va SUELTO y no dentro de un submenu: no es una lista que crezca con
          * el equipo, es una accion sola. La regla de este menu es que lo que
          * crece se pliega; esto no crece.
          *
          * Pide linea y jid porque sin las dos no hay a donde llevar: el mismo
          * contacto tiene conversacion en dos lineas, asi que sin la linea el
          * enlace elegiria «la primera fila que aparezca». */}
        {instanceName && remoteJid && (
          <DropdownMenuItem
            onSelect={() => setCompartirAbierto(true)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Share2 className="h-3.5 w-3.5 shrink-0" />
            Enviar al equipo
          </DropdownMenuItem>
        )}

        {/* Transferir — solo para agentes con sesión propia */}
        {canLiberate && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              Transferir a...
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                className="w-56 overflow-y-auto p-1"
                style={{ maxHeight: 'min(60vh, var(--radix-dropdown-menu-content-available-height))' }}
              >
                {otherAdvisors.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">No hay otros asesores.</p>
                ) : (
                  otherAdvisors.map((a) => (
                    <DropdownMenuItem
                      key={a.id}
                      onSelect={() => void handleTransfer(a.id)}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer"
                    >
                      <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0', colorFor(a.id))}>
                        {initials(a)}
                      </span>
                      <span className="truncate">{a.name ?? a.email}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        )}

        {/* Agregar participante (colaboración) */}
        {puedeAgregarParticipante && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              Agregar participante...
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                className="w-56 overflow-y-auto p-1"
                style={{ maxHeight: 'min(60vh, var(--radix-dropdown-menu-content-available-height))' }}
              >
                {participantCandidates.map((a) => (
                  <DropdownMenuItem
                    key={`part-${a.id}`}
                    onSelect={() => void handleAddParticipant(a.id)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer"
                  >
                    <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0', colorFor(a.id))}>
                      {initials(a)}
                    </span>
                    <span className="truncate">{a.name ?? a.email}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        )}

        {(canLiberate || puedeAgregarParticipante) && (canLiberate || canResolve || canReopen || canReturnToAi || canUnescalate) && (
          <div className="my-1 border-t border-border/50" />
        )}

        {/* Quitar de espera — solo cuando hay sello que quitar.
          *
          * Apaga UNICAMENTE la marca «En espera»: no toca el asignado, ni el
          * estado, ni la IA, ni resuelve. Es para cuando la IA sigue atendiendo
          * bien y ya no queda nada que esperar —ninguno de los otros mandos
          * corresponde ahi—. Si el cliente vuelve a pedir un humano, la marca se
          * vuelve a encender sola. */}
        {canUnescalate && (
          <DropdownMenuItem
            onSelect={() => void handleUnescalate()}
            className="flex items-center gap-2 cursor-pointer"
          >
            <AlarmClockOff className="h-3.5 w-3.5 shrink-0" />
            Quitar de espera
          </DropdownMenuItem>
        )}

        {/* Liberar y Resolver en lista vertical */}
        {canLiberate && (
          <DropdownMenuItem
            onSelect={() => void handleLiberate()}
            className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            Liberar conversación
          </DropdownMenuItem>
        )}
        {canReturnToAi && (
          <DropdownMenuItem
            onSelect={() => void handleReturnToAi()}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Bot className="h-3.5 w-3.5 shrink-0" />
            Devolver a la IA
          </DropdownMenuItem>
        )}
        {canResolve && (
          <DropdownMenuItem
            onSelect={() => void handleResolve()}
            className="flex items-center gap-2 cursor-pointer text-emerald-700 dark:text-emerald-400 focus:text-emerald-700 dark:focus:text-emerald-400 focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
          >
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            Resolver conversación
          </DropdownMenuItem>
        )}
        {canReopen && (
          <DropdownMenuItem
            onSelect={() => void handleReopen()}
            className="flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            Reabrir conversación
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const macrosMenu = session && onRunMacro ? <MacrosMenu onRunMacro={onRunMacro} /> : null;

  // Las pestañas de la conversación, en su orden. Las pintan las dos filas (la
  // del móvil y la de escritorio) con el mismo componente.
  const pestanasDelChat = [
    { id: 'messages', nombre: 'Mensajes' },
    ...(onChatViewChange
      ? [
          { id: 'notes', nombre: 'Notas' },
          ...userIntegrations.map((intg) => ({ id: intg.id, nombre: intg.name })),
        ]
      : []),
  ];

  return (
    /* `data-cabecera-de-chat`: de aquí salen los DOS números con los que se
       coloca todo panel de esta cabecera —su borde DERECHO, que es el filo
       del panel de conversación (todos los menús acaban ahí, sin margen:
       pegados al borde del recuadro), y su borde de ABAJO, que queda justo por
       debajo de la fila de Macros y Acciones (es la última del encabezado)—.
       Un solo elemento y una sola medida: así los seis nacen a la misma altura
       y se puede pasar de uno a otro sin cerrar. Lo lee `usePanelFlotante`. */
    <div
      {...{ [MARCA_DE_LA_CABECERA]: "" }}
      className="sticky top-0 z-10 bg-gradient-to-r from-background to-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/50"
    >
      {/* ── Mobile ── */}
      <div className="md:hidden px-2 py-2 space-y-2 border-b-2 border-border">
        {/* Fila única: volver + avatar + nombre + activa + acciones */}
        <div className="flex items-center gap-2">
          <Button
            onClick={onBackToList}
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full hover:bg-muted flex-shrink-0 -ml-1"
            title="Volver"
            aria-label="Volver"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
          </Button>

          <Avatar className="w-8 h-8 ring-2 ring-border flex-shrink-0">
            <AvatarImage src={header.avatarSrc || '/default-avatar.png'} />
            <AvatarFallback className="text-xs font-bold">{initialFromName(displayedContactName)}</AvatarFallback>
          </Avatar>

          {/* Alto FIJO + centrado → header mide igual con o sin el subtítulo del anuncio. */}
          <div className="flex h-9 min-w-0 flex-1 flex-col justify-center overflow-hidden">
            <div className="flex items-center gap-1">
              {header.isPinned && (
                <Pin className="h-3 w-3 fill-current text-amber-500 flex-shrink-0" />
              )}
              <h2 className="truncate text-sm font-bold leading-tight capitalize">{displayedContactName}</h2>
            </div>
            {presencia ? (
              <span className="truncate text-xs italic leading-tight text-emerald-600 dark:text-emerald-400">
                {presencia === "grabando" ? "grabando audio…" : "escribiendo…"}
              </span>
            ) : conexion?.estado === "en_linea" ? (
              <span className="truncate text-xs font-medium leading-tight text-emerald-600 dark:text-emerald-400">en línea</span>
            ) : conexion?.estado === "desconectado" && conexion.lastSeen ? (
              <span className="truncate text-xs leading-tight text-muted-foreground">
                {`últ. vez ${ultimaVezTexto(conexion.lastSeen)}`}
              </span>
            ) : null}
            {!hayLineaDeEstado && adSourceLabel && (
              <span className="flex items-center gap-0.5 text-[0.6rem] leading-none text-blue-500 dark:text-blue-400 truncate">
                <Megaphone className="h-2.5 w-2.5 shrink-0" />
                {adSourceLabel}
              </span>
            )}
          </div>

          {session ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setMobileToolsOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md"
              >
                <Badge variant="outline" className={`${sessionStatusTone} text-xs py-0.5`}>
                  {session.status ? 'Activa' : 'Pausada'}
                </Badge>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 text-muted-foreground transition-transform duration-200',
                    mobileToolsOpen && 'rotate-180',
                  )}
                />
              </button>
              {macrosMenu}
              {lifecycleButton}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground flex-shrink-0">Sin sesión</span>
          )}
        </div>

        {/* Herramientas expandibles — una fila con scroll */}
        {session && mobileToolsOpen && (
          <div className="-mx-2 border-t border-border/30 bg-muted/30">
            <div className="flex items-center justify-between gap-1.5 px-2 py-1.5 overflow-x-auto scrollbar-none">
              {/* 1. Acción directa */}
              <MenuDeLlamada datos={datosParaLlamar} className="h-7 w-7" iconoClassName="h-3.5 w-3.5" />
              {advisorBadge}
              {/* 2. CRM / agenda */}
              <ChatReminderDialog session={session!} userId={userId} />
              <ChatAppointmentStatusButton
                sessionId={session.id}
                userId={session.userId}
                pushName={session.pushName}
                remoteJid={session.remoteJid}
                instanceId={session.instanceId}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-md border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => setTaskDialogOpen(true)}
                title="Nueva tarea"
              >
                <ClipboardList className="h-3.5 w-3.5" />
              </Button>
              {/* 3. Datos del contacto */}
              <ChatRegistrosBadge
                sessionId={session.id}
                sessionPushName={session.pushName}
                whatsapp={displayedWhatsapp}
                userId={session.userId}
                remoteJid={session.remoteJid}
                instanceId={session.instanceId}
                flujos={session.flujos}
                leadStatus={session.leadStatus}
                leadScore={session.leadScore}
                leadScoreReason={session.leadScoreReason}
                tags={session.tags}
                sessionSeguimientos={session.seguimientos}
                registrosResumen={session.registrosResumen}
                onSessionRefresh={onSessionRefresh}
              />
              {/* La síntesis se ve y se edita en el Contexto del lead (el cerebro). */}
              <LeadContextSheet session={session} onScoreUpdated={onSessionRefresh} />
              {tagsCombobox}
              {/* 4. Gestión */}
              {sessionToggle}
            </div>
          </div>
        )}

        {/* Fila 2 mobile: pestañas + lupa — siempre al fondo. Las pestañas
            que no caben se pliegan en «Más» (`PestanasDelChat`); la lupa y la
            ficha no se van por la derecha. */}
        {(onChatViewChange || onToggleSearch) && (
          <div className="-mx-2 -mt-1 flex items-center border-t border-border/20">
            <PestanasDelChat
              pestanas={pestanasDelChat}
              activa={chatView ?? 'messages'}
              onCambiar={(id) => onChatViewChange?.(id)}
              clasePestana="px-3 py-1.5"
            />
            <div className="flex shrink-0 items-center gap-0.5 mr-1">
              {onToggleSearch && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground',
                    searchOpen && 'text-blue-500 dark:text-blue-400',
                  )}
                  onClick={onToggleSearch}
                  title="Buscar en el chat"
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
              )}
              {onToggleInfoPanel && session && (
                <Button
                  type="button"
                  onClick={onToggleInfoPanel}
                  title={infoPanelOpen ? 'Cerrar ficha del contacto' : 'Ver ficha del contacto'}
                  className="h-7 flex items-center gap-1 px-2 rounded-lg border border-border bg-background text-foreground hover:bg-muted shrink-0 transition-colors"
                  size="sm"
                >
                  <UserRound className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                  {infoPanelOpen
                    ? <PanelRightClose className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                    : <PanelRightOpen className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop ── */}
      {/* Alto FIJO (rem) IGUAL al del toolbar del sidebar → el borde/divisor queda
          continuo de lado a lado a cualquier zoom. Contenido centrado vertical. */}
      <div data-cabecera-escritorio className={cn('hidden md:flex md:flex-col md:justify-center overflow-hidden border-b-2 border-border', CABECERA_ESCRITORIO)}>
      <div className={cn('flex shrink-0 items-center gap-3 overflow-hidden', CLASE_FILA_1)}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {onExpandChatList && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onExpandChatList}
              title="Expandir lista de chats"
              className="h-8 w-8 shrink-0 rounded-md border border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <PanelRightOpen className="h-4 w-4" />
            </Button>
          )}
          <Avatar className="w-9 h-9 ring-2 ring-border flex-shrink-0">
            <AvatarImage src={header.avatarSrc || '/default-avatar.png'} />
            <AvatarFallback className="text-lg font-bold">{initialFromName(displayedContactName)}</AvatarFallback>
          </Avatar>
          {/* Alto FIJO del bloque nombre(+subtítulo): con `justify-center` el contenido se
              centra, así el header mide EXACTAMENTE igual con o sin el subtítulo del
              anuncio → "Mensajes/Notas/Web" queda a la misma altura en todos los chats. */}
          <div className="flex h-9 flex-col justify-center overflow-hidden min-w-0">
            <div className="flex items-center gap-1.5">
              {header.isPinned && (
                <Pin className="h-4 w-4 fill-current text-amber-500 flex-shrink-0" />
              )}
              <h2 className="truncate text-sm font-bold capitalize" title={displayedContactName}>{displayedContactName}</h2>
              {session && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full hover:bg-muted flex-shrink-0"
                  onClick={onOpenContactEditor}
                  title="Editar contacto"
                >
                  <PencilLine className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {presencia ? (
              <span className="truncate text-xs italic leading-tight text-emerald-600 dark:text-emerald-400">
                {presencia === "grabando" ? "grabando audio…" : "escribiendo…"}
              </span>
            ) : conexion?.estado === "en_linea" ? (
              <span className="truncate text-xs font-medium leading-tight text-emerald-600 dark:text-emerald-400">en línea</span>
            ) : conexion?.estado === "desconectado" && conexion.lastSeen ? (
              <span className="truncate text-xs leading-tight text-muted-foreground">
                {`últ. vez ${ultimaVezTexto(conexion.lastSeen)}`}
              </span>
            ) : null}
            {!hayLineaDeEstado && adSourceLabel && (
              <span className="flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400 leading-tight truncate">
                <Megaphone className="h-3 w-3 shrink-0" />
                {adSourceLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {session && (
            <>
              {/* 1. Acción directa */}
              <MenuDeLlamada datos={datosParaLlamar} className="h-7 w-7" iconoClassName="h-4 w-4" />
              {advisorBadge}
              {/* 2. CRM / agenda */}
              <ChatReminderDialog session={session!} userId={userId} />
              <ChatAppointmentStatusButton
                sessionId={session.id}
                userId={session.userId}
                pushName={session.pushName}
                remoteJid={session.remoteJid}
                instanceId={session.instanceId}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-md border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => setTaskDialogOpen(true)}
                title="Nueva tarea"
              >
                <ClipboardList className="h-3.5 w-3.5" />
              </Button>
              {/* 3. Datos del contacto */}
              <ChatRegistrosBadge
                sessionId={session.id}
                sessionPushName={session.pushName}
                whatsapp={displayedWhatsapp}
                userId={session.userId}
                remoteJid={session.remoteJid}
                instanceId={session.instanceId}
                flujos={session.flujos}
                leadStatus={session.leadStatus}
                leadScore={session.leadScore}
                leadScoreReason={session.leadScoreReason}
                tags={session.tags}
                sessionSeguimientos={session.seguimientos}
                registrosResumen={session.registrosResumen}
                onSessionRefresh={onSessionRefresh}
              />
              {/* La síntesis se ve y se edita aquí dentro: ya no hay icono aparte. */}
              <LeadContextSheet session={session} onScoreUpdated={onSessionRefresh} />
              {tagsCombobox}
            </>
          )}
        </div>
        {/* La ficha va FUERA de la tira que se desplaza, como Acciones en la
            fila de abajo. Dentro, cuando la conversación se estrechaba —la
            ficha abierta, un panel lateral— la tira desbordaba y la ficha se
            iba por la derecha (medido: 72 px fuera a 1024) o quedaba en otro
            filo que Acciones. Así las dos acaban en el mismo píxel: el borde
            menos el margen de la cabecera. */}
        {onToggleInfoPanel && session && (
          <Button
            type="button"
            onClick={onToggleInfoPanel}
            title={infoPanelOpen ? 'Cerrar ficha del contacto' : 'Ver ficha del contacto'}
            className="hidden md:flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-border bg-background text-foreground hover:bg-muted shrink-0 transition-colors"
            size="sm"
          >
            <UserRound className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
            {infoPanelOpen
              ? <PanelRightClose className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
              : <PanelRightOpen className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />}
          </Button>
        )}
      </div>{/* end fila 1 */}

      {/* ── Fila 2: pestañas + búsqueda, Macros y Acciones ──
        *
        * Dos cajas y no una. Era una sola con `overflow-x-auto`, y cuando
        * faltaba ancho —ficha de contacto, un panel lateral— lo que se iba por
        * la derecha eran Macros y Acciones. Ahora ceden las PESTAÑAS (se
        * pliegan en «Más», `PestanasDelChat`) y la caja de la derecha va
        * `shrink-0`: Macros y Acciones se ven siempre. */}
      {(onChatViewChange || onToggleSearch) && (
        /* `-ml-4`: la primera pestaña lleva su propio `px-4`, que es además el
           ancho de su subrayado; sin tirar de la fila, su TEXTO arrancaría 16 px
           más adentro que el avatar de encima. */
        <div data-fila-de-pestanas className={cn('-ml-4 flex shrink-0 items-center', CLASE_FILA_2)}>
          <PestanasDelChat
            pestanas={pestanasDelChat}
            activa={chatView ?? 'messages'}
            onCambiar={(id) => onChatViewChange?.(id)}
            clasePestana="px-4 h-8"
          />
          <div data-mandos-de-la-fila className="flex shrink-0 items-center gap-1 pl-1">
            {onToggleSearch && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground',
                  searchOpen && 'text-blue-500 dark:text-blue-400',
                )}
                onClick={onToggleSearch}
                title="Buscar en el chat"
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            )}
            {macrosMenu}
            {lifecycleButton}
          </div>
        </div>
      )}
      </div>{/* end desktop flex-col */}

      {!session && !(remoteJid && isLidJid(remoteJid)) && (
        <div className="md:hidden px-2 py-2 bg-amber-50/50 dark:bg-amber-950/20 border-t border-amber-200/50 dark:border-amber-800/30 text-xs text-amber-700 dark:text-amber-600">
          Sin sesión CRM sincronizada
        </div>
      )}

      {remoteJid && isLidJid(remoteJid) && !avisoLidOculto && (
        <div className="flex items-center justify-between gap-2 border-t border-amber-200/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-400">
          {confirmDeleteLid ? (
            <>
              <span className="min-w-0">¿Eliminar este chat duplicado? Quedará solo el contacto original.</span>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="outline" className="h-7" disabled={deletingLid} onClick={() => setConfirmDeleteLid(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7"
                  disabled={deletingLid}
                  onClick={async () => {
                    setDeletingLid(true);
                    try {
                      const res = await deleteLidChat({ lidJid: remoteJid, instanceName });
                      if (!res.ok) { toast.error(res.error); return; }
                      toast.success('Chat eliminado.');
                      setTimeout(() => window.location.reload(), 700);
                    } catch {
                      toast.error('No se pudo eliminar. Intenta de nuevo.');
                    } finally {
                      setDeletingLid(false);
                    }
                  }}
                >
                  {deletingLid ? 'Eliminando…' : 'Sí, eliminar'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="min-w-0">
                Este chat usa un ID interno de WhatsApp. Si es un contacto duplicado, únelo con el real.
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="outline" className="h-7" onClick={() => setMergeOpen(true)}>
                  Unir contacto
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 dark:text-red-400" onClick={() => setConfirmDeleteLid(true)}>
                  Eliminar
                </Button>
                {/* Cerrar el aviso: este contacto no tiene número real y no hay
                    nada que unir. No vuelve a salir en este chat. */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-400"
                  title="Ocultar este aviso"
                  onClick={() => { if (remoteJid) { ocultarAvisoLid(remoteJid); setAvisoLidOculto(true); } }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <MergeLidDialog open={mergeOpen} onOpenChange={setMergeOpen} lidJid={remoteJid ?? ''} instanceName={instanceName} />

      {/* Compartir con el equipo.
        *
        * El numero se COPIA de lo que la pantalla ya sabe y no se saca del jid:
        * los digitos de un `@lid` son un id de privacidad, no un telefono. */}
      {instanceName && remoteJid && (
        <CompartirConElEquipo
          abierto={compartirAbierto}
          onCerrar={() => setCompartirAbierto(false)}
          chat={{
            linea: instanceName,
            jid: remoteJid,
            identidades: Array.from(new Set([remoteJid, ...(identidadesDelChat ?? [])])),
            nombre: displayedContactName || null,
            numero: displayedWhatsapp || null,
          }}
        />
      )}

      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        session={session}
        currentUserId={userId}
      />

    </div>
  );
};
