"use client";

import { Archive, Ban, BellOff, ChevronDown, Lock, Check, CheckCheck, Star, SquarePen, CalendarClock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PASTILLAS_DE_LA_COLUMNA } from "@/lib/cabeceras-de-chats";
import { FLECHA_APAGADA, FLECHA_DE_LA_FILA, FLECHA_ENCENDIDA, PastillaDeFiltro, TONO_EN_ESPERA, TONO_MIAS, TONO_SIN_LEER, TONO_TODOS } from "@/components/shared/PastillaDeFiltro";
import { MARCA_DE_LAS_PASTILLAS, usePanelFlotante } from "@/hooks/usePanelFlotante";
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU } from "@/lib/paneles-flotantes";
import type { TabCounts, TabKey } from "./chat-sidebar.types";

type ChatTabBarProps = {
  onTabChange: (tab: TabKey) => void;
  tab: TabKey;
  /**
   * Hay un filtro de estado puesto («Sin leer», «En espera»).
   *
   * Van en el MISMO grupo excluyente que «Todos» y «Mías», asi que mientras uno
   * de ellos mande, la pestaña no se pinta activa: si no, se ven dos encendidos
   * a la vez y no hay forma de saber cual esta filtrando de verdad.
   */
  hayFiltroDeEstado?: boolean;
  tabCounts: TabCounts;
  showMine?: boolean;
  unreadOnly?: boolean;
  onToggleUnread?: () => void;
  unreadCount?: number;
  /** Escalados a una persona y sin asesor que los atienda. */
  enEsperaOnly?: boolean;
  onToggleEnEspera?: () => void;
  enEsperaCount?: number;
  starredOnly?: boolean;
  onToggleStarred?: () => void;
  starredCount?: number;
  notesOnly?: boolean;
  onToggleNotes?: () => void;
  notesCount?: number;
  /** Abrir el diálogo de conversación nueva. Vive aquí y no en la fila de
   *  arriba porque casi no se usa y allá le quitaba ancho al buscador. */
  onCompose?: () => void;
  /** Abre el diálogo de borrado por fecha. Sin permiso para eliminar, no llega. */
  onDeleteByDate?: () => void;
};

const MAIN_TABS: { key: TabKey; label: string }[] = [
  { key: "mine", label: "Mías" },
  { key: "all",  label: "Todos" },
];

// La pastilla —su forma, sus huecos que ceden y su insignia— vive en
// `components/shared/PastillaDeFiltro.tsx`: la pintan también los filtros de
// Correo, y con una copia en cada sitio el día que se afine una la otra se
// queda atrás. Aquí solo se decide cuáles salen y con qué número.

export function ChatTabBar({ onTabChange, tab, hayFiltroDeEstado, tabCounts, showMine = false, unreadOnly, onToggleUnread, unreadCount, enEsperaOnly, onToggleEnEspera, enEsperaCount, starredOnly, onToggleStarred, starredCount, notesOnly, onToggleNotes, notesCount, onCompose, onDeleteByDate }: ChatTabBarProps) {
  // El «⋯» abre un panel del ANCHO de la columna, pegado a su filo izquierdo y
  // justo debajo de esta misma fila. Lo decide `usePanelFlotante`, igual que los
  // otros tres filtros de la cabecera de la lista: escrito aquí a mano sería el
  // quinto `align` distinto de la pantalla.
  const masFiltros = usePanelFlotante("columnaAncha", "menu");
  const visibleTabs = MAIN_TABS.filter((t) => t.key !== "mine" || showMine);
  const isOverflowActive = tab === "archived" || tab === "resolved" || tab === "blocked" || tab === "muted" || starredOnly || notesOnly;
  const renderTab = ({ key, label }: (typeof MAIN_TABS)[number]) => (
    <PastillaDeFiltro
      key={key}
      valor={key}
      rotulo={label}
      activa={tab === key && !hayFiltroDeEstado}
      alPulsar={() => onTabChange(key)}
      tono={key === "mine" ? TONO_MIAS : TONO_TODOS}
      cuenta={tabCounts[key] > 0 ? tabCounts[key] : undefined}
    />
  );

  return (
    /* UNA sola fila, con la flecha dentro y `justify-between`.
       ==========================================================
       Eran dos cajas: un grupo `flex-1` con las pastillas y la flecha fuera.
       Con el grupo ocupando todo el ancho sobrante y las pastillas alineadas
       a la izquierda, **todo el hueco que sobraba caía en un solo sitio**: el
       que queda entre la última pastilla y la flecha. Medido sobre la página
       servida, ese hueco era de 4 px con una cuenta grande y de **76 px con
       tres pastillas, 85 con cuatro sin insignias y 100 en un móvil**, con los
       tres de en medio clavados en 4. La flecha estaba pegada al borde —0 px,
       medido— pero la fila se leía descuadrada, porque el ojo ve el hueco, no
       el borde.

       `justify-between` reparte ese sobrante **por igual entre todos los
       huecos**, y no pone nada en los extremos: la primera pastilla sigue
       pegada a la izquierda y la flecha a la derecha, alineadas con el
       buscador y con el último icono de la fila de arriba. Y el `gap-1` pasa a
       ser el MÍNIMO —cuando no sobra nada, los huecos son esos 4 px—, así que
       **son iguales entre sí a cualquier anchura**, que es lo que no pasaba.

       Y NO es `justify-evenly`, que es lo que había antes del #815 y lo que
       aquel quitó: aquel reparte hueco también **antes de la primera** y
       **después de la última**, así que la fila nacía despegada de los dos
       bordes. La diferencia entre los dos es justo esa, y es la que se pide.

       `overflow-hidden` se queda de red de seguridad y NO como la solución:
       es preferible a una barra de deslizar, pero lo que de verdad evita que
       una pastilla se corte es que los huecos de dentro cedan. */
    <div
      {...{ [MARCA_DE_LAS_PASTILLAS]: "" }}
      className={PASTILLAS_DE_LA_COLUMNA}
    >
      {visibleTabs.map(renderTab)}

      {/* «Sin leer» —antes «No leídos»—. Dos palabras cortas en vez de dos
          largas: en una fila que se pelea por el ancho, el rótulo es lo
          único que se puede acortar sin quitar información. Se llama igual
          en el atajo de la pantalla vacía: dos nombres para el mismo filtro
          se leen como dos filtros. */}
      {onToggleUnread && (
        <PastillaDeFiltro
          valor="sinLeer"
          rotulo="Sin leer"
          activa={!!unreadOnly}
          alPulsar={onToggleUnread}
          tono={TONO_SIN_LEER}
          cuenta={(unreadCount ?? 0) > 0 ? ((unreadCount ?? 0) > 99 ? "99+" : unreadCount) : undefined}
        />
      )}

      {/* En espera: pidieron una persona —o el agente guardo una solicitud,
          pedido, reserva, reclamo o cita— y nadie les ha contestado aun.
          Va detras de «Sin leer» porque es otro ESTADO del chat, y uno puede
          estar leido y seguir esperando.

          El CHIP esta siempre, desde el primer pintado y sin esperar dato:
          quien no lo ve no sabe si es que no hay nadie esperando o que el
          filtro no existe, y ademas la barra se queda quieta en vez de que
          los chips salten de sitio cada vez que entra o sale uno. Lo que si
          desaparece en cero es la INSIGNIA, como en «Sin leer».

          En rosa porque el naranja ya esta cogido dos veces -«Sin leer» y el
          chip de minutos de la tarjeta-. */}
      {onToggleEnEspera && (
        <PastillaDeFiltro
          valor="enEspera"
          rotulo="En espera"
          title="Pidieron un asesor o el agente guardó un registro, y nadie del equipo les ha contestado aún"
          activa={!!enEsperaOnly}
          alPulsar={onToggleEnEspera}
          tono={TONO_EN_ESPERA}
          tabular
          cuenta={(enEsperaCount ?? 0) > 0 ? ((enEsperaCount ?? 0) > 99 ? "99+" : enEsperaCount) : undefined}
        />
      )}

      {/* La flecha es UNA MÁS de la fila, no algo que va detrás de ella.
          Como hermana de las pastillas entra en el reparto de
          `justify-between`, así que el hueco que la separa de la última
          pastilla es el mismo que hay entre dos pastillas. Fuera de la fila
          —que es como estaba— ese hueco era todo el sobrante de golpe. */}
      <DropdownMenu onOpenChange={masFiltros.alAbrir}>
        <DropdownMenuTrigger asChild ref={masFiltros.disparador}>
          <button
            type="button"
            aria-label="Más filtros"
            data-flecha-de-la-fila
            className={cn(FLECHA_DE_LA_FILA, isOverflowActive ? FLECHA_ENCENDIDA : FLECHA_APAGADA)}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent {...masFiltros.props} className={cn(RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}>
          {onCompose && (
            <>
              <DropdownMenuItem
                onSelect={onCompose}
                className="flex items-center gap-1.5 cursor-pointer py-1 text-xs"
              >
                <SquarePen className="h-3 w-3 shrink-0 text-muted-foreground" />
                Nuevo mensaje
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {onToggleStarred && (
            <DropdownMenuItem
              onSelect={onToggleStarred}
              className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
            >
              <span className="flex items-center gap-1.5 text-xs">
                <Star className={cn("h-3 w-3 shrink-0", starredOnly ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                Destacados
              </span>
              <span className="flex items-center gap-1">
                {(starredCount ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{starredCount}</span>}
                {starredOnly && <Check className="h-3 w-3 text-primary" />}
              </span>
            </DropdownMenuItem>
          )}
          {onToggleNotes && (
            <DropdownMenuItem
              onSelect={onToggleNotes}
              className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
            >
              <span className="flex items-center gap-1.5 text-xs">
                <Lock className={cn("h-3 w-3 shrink-0", notesOnly ? "text-amber-500" : "text-muted-foreground")} />
                Con notas
              </span>
              <span className="flex items-center gap-1">
                {(notesCount ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{notesCount}</span>}
                {notesOnly && <Check className="h-3 w-3 text-primary" />}
              </span>
            </DropdownMenuItem>
          )}
          {(onToggleStarred || onToggleUnread || onToggleNotes) && (
            <div className="my-1 border-t border-border/50" />
          )}
          <DropdownMenuItem
            onSelect={() => onTabChange("archived")}
            className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
          >
            <span className="flex items-center gap-1.5 text-xs">
              <Archive className="h-3 w-3 text-muted-foreground shrink-0" />
              Archivados
            </span>
            {tabCounts.archived > 0 && (
              <span className="text-[10px] text-muted-foreground">{tabCounts.archived}</span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onTabChange("resolved")}
            className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
          >
            <span className="flex items-center gap-1.5 text-xs">
              <CheckCheck className="h-3 w-3 text-muted-foreground shrink-0" />
              Resueltos
            </span>
            {tabCounts.resolved > 0 && (
              <span className="text-[10px] text-muted-foreground">{tabCounts.resolved}</span>
            )}
          </DropdownMenuItem>
          {/* Bloqueados y silenciados van juntos: los dos son decisiones sobre
              el CONTACTO, no estados de la conversacion. */}
          <div className="my-1 border-t border-border/50" />
          <DropdownMenuItem
            onSelect={() => onTabChange("blocked")}
            className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
          >
            <span className="flex items-center gap-1.5 text-xs">
              <Ban className="h-3 w-3 text-muted-foreground shrink-0" />
              Bloqueados
            </span>
            {tabCounts.blocked > 0 && (
              <span className="text-[10px] text-muted-foreground">{tabCounts.blocked}</span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onTabChange("muted")}
            className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
          >
            <span className="flex items-center gap-1.5 text-xs">
              <BellOff className="h-3 w-3 text-muted-foreground shrink-0" />
              Silenciados
            </span>
            {tabCounts.muted > 0 && (
              <span className="text-[10px] text-muted-foreground">{tabCounts.muted}</span>
            )}
          </DropdownMenuItem>
          {onDeleteByDate && (
            <>
              <div className="my-1 border-t border-border/50" />
              <DropdownMenuItem
                onSelect={() => onDeleteByDate()}
                className="flex cursor-pointer items-center gap-1.5 py-1 text-xs text-destructive focus:text-destructive"
              >
                <CalendarClock className="h-3 w-3 shrink-0" />
                Eliminar por fecha...
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}


