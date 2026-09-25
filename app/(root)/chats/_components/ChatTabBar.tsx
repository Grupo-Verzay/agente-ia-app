"use client";

import type { ComponentType } from "react";
import { Inbox, UserCheck, Archive, ChevronDown, Lock, MessageCircle, Check, CheckCheck, Star, SquarePen, CalendarClock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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

const MAIN_TABS: { key: TabKey; label: string; Icon: ComponentType<{ className?: string }>; color: string }[] = [
  { key: "mine", label: "Mías",  Icon: UserCheck, color: "#7C3AED" },
  { key: "all",  label: "Todos", Icon: Inbox,     color: "#007BFF" },
];

/**
 * El hueco de los lados de una pastilla, y ENCOGE.
 *
 * Es un `<span>` de verdad y no el `px-2` de antes porque **el padding no se
 * encoge**: en un flex lo que cede es un HIJO, y un padding no lo es. Con
 * `px-2` la fila solo tenía dos finales —desbordar (y `overflow-hidden` la
 * corta, que desde fuera se ve como una pastilla partida) o partirse en dos
 * líneas—. Siendo un hijo con `shrink`, cede él antes que el texto, que va
 * `shrink-0`: **solo cuando falta ancho, y solo lo que falte.**
 *
 * Con sitio de sobra mide sus 8 px y la fila se ve exactamente como se veía.
 *
 * Y tampoco es un `::before`: **un pseudo-elemento de un `<button>` no llega a
 * ser un hijo del flex.** Medido en Chromium — con `flex: 0 1 8px` daba 0 px
 * incluso en un contenedor de 600 px, o sea que la pastilla nacía ya sin
 * huecos. Con un `<span>` mide 8 px en reposo y 6 px a 110 px de ancho.
 */
const HUECO_QUE_ENCOGE = "block w-2 min-w-0 shrink";

/**
 * El hueco entre el rótulo y su contador, y también ENCOGE.
 *
 * Eran los 4 px de un `ms-1`, y un margen tampoco cede. Con solo los dos de
 * los lados el presupuesto era de 16 px por pastilla —64 px en la fila— y
 * medido se quedaba **1 px corto** en el peor caso: cuatro filtros, un
 * «Todos 15.036» y la columna de 1024, que es la más estrecha de las cuatro.
 * Con este son 20 px por pastilla y sobra sitio.
 *
 * Es la mitad de ancho que los de los lados, así que cede la mitad: el número
 * se acerca a su rótulo antes de que la pastilla se acerque a su borde, que es
 * el orden que se quiere.
 */
const HUECO_ENTRE = "block w-1 min-w-0 shrink";

/**
 * Lo común a las cuatro pastillas, escrito UNA vez.
 *
 * Estaba copiado tres veces —las dos pestañas, «Sin leer» y «En espera»— y con
 * la copia, el día que se afine el alto o el hueco se afina en una y las otras
 * se quedan atrás. Eso no se ve como un error: se ve como una fila de
 * pastillas que no encajan entre ellas.
 *
 * **Sin `shrink-0` y con `min-w-0`**: es lo que deja que el hueco de dentro
 * ceda. Con `shrink-0` la pastilla no podía encoger y el hueco no servía de
 * nada.
 */
const PASTILLA = "inline-flex h-6 min-w-0 items-center justify-center rounded-full border text-xs font-medium whitespace-nowrap transition-all";

/** La insignia del contador. Su separación la pone `HUECO_ENTRE`, no un margen. */
const INSIGNIA = "flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white";


export function ChatTabBar({ onTabChange, tab, hayFiltroDeEstado, tabCounts, showMine = false, unreadOnly, onToggleUnread, unreadCount, enEsperaOnly, onToggleEnEspera, enEsperaCount, starredOnly, onToggleStarred, starredCount, notesOnly, onToggleNotes, notesCount, onCompose, onDeleteByDate }: ChatTabBarProps) {
  // El «⋯» abre un panel del ANCHO de la columna, pegado a su filo izquierdo y
  // justo debajo de esta misma fila. Lo decide `usePanelFlotante`, igual que los
  // otros tres filtros de la cabecera de la lista: escrito aquí a mano sería el
  // quinto `align` distinto de la pantalla.
  const masFiltros = usePanelFlotante("columnaAncha", "menu");
  const visibleTabs = MAIN_TABS.filter((t) => t.key !== "mine" || showMine);
  const isOverflowActive = tab === "archived" || tab === "resolved" || starredOnly || notesOnly;
  const renderTab = ({ key, label, color }: (typeof MAIN_TABS)[number]) => {
    const count = tabCounts[key];
    const isActive = tab === key && !hayFiltroDeEstado;

    return (
      <button
        key={key}
        type="button"
        onClick={() => onTabChange(key)}
        className={PASTILLA}
        style={
          isActive
            ? { background: color, borderColor: color, color: "#fff" }
            : { borderColor: `${color}50`, color, background: `${color}10` }
        }
      >
        <span aria-hidden="true" className={HUECO_QUE_ENCOGE} />
        <span className="shrink-0">{label}</span>
        {count > 0 && (
          <>
          <span aria-hidden="true" className={HUECO_ENTRE} />
          <span
            className={INSIGNIA}
            style={{ background: isActive ? "rgba(255,255,255,0.3)" : color }}
          >
            {count}
          </span>
          </>
        )}
        <span aria-hidden="true" className={HUECO_QUE_ENCOGE} />
      </button>
    );
  };

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
      className="flex w-full items-center justify-between gap-1 overflow-hidden"
    >
      {visibleTabs.map(renderTab)}

      {/* «Sin leer» —antes «No leídos»—. Dos palabras cortas en vez de dos
          largas: en una fila que se pelea por el ancho, el rótulo es lo
          único que se puede acortar sin quitar información. Se llama igual
          en el atajo de la pantalla vacía: dos nombres para el mismo filtro
          se leen como dos filtros. */}
      {onToggleUnread && (
        <button
          type="button"
          onClick={onToggleUnread}
          className={cn(
            PASTILLA,
            unreadOnly
              ? "border-orange-500 bg-orange-500 text-white"
              : "border-orange-300 bg-orange-50 text-orange-500 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20"
          )}
        >
          <span aria-hidden="true" className={HUECO_QUE_ENCOGE} />
          <span className="shrink-0">Sin leer</span>
          {(unreadCount ?? 0) > 0 && (
            <>
            <span aria-hidden="true" className={HUECO_ENTRE} />
            <span
              className={INSIGNIA}
              style={{ background: unreadOnly ? "rgba(255,255,255,0.3)" : "#f97316" }}
            >
              {(unreadCount ?? 0) > 99 ? "99+" : unreadCount}
            </span>
            </>
          )}
          <span aria-hidden="true" className={HUECO_QUE_ENCOGE} />
        </button>
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
        <button
          type="button"
          onClick={onToggleEnEspera}
          title="Pidieron un asesor o el agente guardó un registro, y nadie del equipo les ha contestado aún"
          aria-pressed={!!enEsperaOnly}
          className={cn(
            PASTILLA,
            enEsperaOnly
              ? "border-rose-600 bg-rose-600 text-white"
              : "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
          )}
        >
          <span aria-hidden="true" className={HUECO_QUE_ENCOGE} />
          <span className="shrink-0">En espera</span>
          {/* En cero NO se pinta insignia, igual que «Sin leer». Un «0» al
              lado se lee como un dato y no lo es: lo que dice es que no hay
              nada esperando, y eso ya lo dice la ausencia. El chip sigue ahi
              -desde el primer pintado- para que se sepa que el filtro
              existe. */}
          {(enEsperaCount ?? 0) > 0 && (
            <>
            <span aria-hidden="true" className={HUECO_ENTRE} />
            <span
              className={cn(INSIGNIA, "tabular-nums")}
              style={{ background: enEsperaOnly ? "rgba(255,255,255,0.3)" : "#e11d48" }}
            >
              {(enEsperaCount ?? 0) > 99 ? "99+" : enEsperaCount}
            </span>
            </>
          )}
          <span aria-hidden="true" className={HUECO_QUE_ENCOGE} />
        </button>
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
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-all shrink-0",
              isOverflowActive
                ? "border-slate-500 bg-slate-500 text-white"
                : "border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700",
            )}
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


