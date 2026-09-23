'use client';

import React from 'react';
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePanelFlotante } from '@/hooks/usePanelFlotante';
import { PANEL_QUE_SE_DESPLAZA } from '@/lib/paneles-flotantes';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface MessageContextMenuProps {
  isUserMessage: boolean;
  onCopy: () => void;
  onReact: (emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * La barra de reacciones y el menú de Copiar / Editar / Eliminar de un mensaje.
 *
 * Era un `div` con `absolute bottom-8` DENTRO del hilo, que se desplaza: con el
 * mensaje pegado al borde de arriba del hilo la fila de reacciones quedaba por
 * encima de él, el `overflow` del hilo la recortaba y no se podía pulsar (a zoom
 * 80 % cabía, a 100 % no). Ahora va en un portal y lo coloca `usePanelFlotante`
 * con la clase `enElHilo`: prefiere ARRIBA, **voltea abajo si arriba no cabe
 * entero dentro del hilo**, y se corre de costado lo justo para no salirse.
 */
export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  isUserMessage,
  onCopy,
  onReact,
  onEdit,
  onDelete,
}) => {
  const panel = usePanelFlotante('enElHilo', 'menu', isUserMessage ? 'end' : 'start');

  return (
    <DropdownMenu modal={false} onOpenChange={panel.alAbrir}>
      <DropdownMenuTrigger asChild>
        <button
          ref={panel.disparador}
          type="button"
          aria-label="Más opciones"
          title="Más opciones"
          data-menu-del-mensaje=""
          // Abierto se queda visible: si no, al salir el ratón hacia el menú el
          // botón desaparece y el menú se queda colgando de nada.
          className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        {...panel.props}
        data-panel-del-mensaje=""
        className={cn('min-w-[160px] rounded-xl p-0', PANEL_QUE_SE_DESPLAZA)}
      >
        {/* Reacciones */}
        <div className="flex items-center gap-1 px-2 py-2 border-b border-border" data-reacciones="">
          {REACTIONS.map((emoji) => (
            <DropdownMenuItem
              key={emoji}
              onSelect={() => onReact(emoji)}
              className="p-0 text-base leading-none hover:scale-125 transition-transform focus:bg-transparent cursor-pointer"
              title={`Reaccionar con ${emoji}`}
              aria-label={`Reaccionar con ${emoji}`}
            >
              {emoji}
            </DropdownMenuItem>
          ))}
        </div>

        {/* Copiar */}
        <DropdownMenuItem
          onSelect={() => onCopy()}
          className="w-full flex items-center gap-2 rounded-none px-3 py-2 text-sm cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          Copiar
        </DropdownMenuItem>

        {/* Editar (solo mensajes propios) */}
        {onEdit && isUserMessage && (
          <DropdownMenuItem
            onSelect={() => onEdit()}
            className="w-full flex items-center gap-2 rounded-none px-3 py-2 text-sm cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            Editar
          </DropdownMenuItem>
        )}

        {/* Eliminar (solo admin) */}
        {onDelete && (
          <DropdownMenuItem
            onSelect={() => onDelete()}
            className="w-full flex items-center gap-2 rounded-none rounded-b-xl px-3 py-2 text-sm text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
