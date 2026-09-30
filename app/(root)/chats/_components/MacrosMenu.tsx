'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Zap, Loader2, Settings2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { getMacrosAction, type MacroData } from '@/actions/macro-actions';
import { MARCA_DE_MACROS, usePanelFlotante } from '@/hooks/usePanelFlotante';
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU } from '@/lib/paneles-flotantes';
import { cn } from '@/lib/utils';
import { elMensajeDelMenuDelChat } from '@/lib/macros';

interface Props {
  /** Ejecuta la macro (el padre ya tiene la sesión + contexto del chat). */
  onRunMacro: (macroId: string) => Promise<void>;
}

export function MacrosMenu({ onRunMacro }: Props) {
  const [macros, setMacros] = useState<MacroData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  // Controlado: al terminar la macro el menú se cierra solo. Se queda abierto
  // MIENTRAS corre —es donde se ve la ruedita—, pero después, abierto encima de
  // la conversación, se come el primer clic de quien vuelve a escribir.
  const [abierto, setAbierto] = useState(false);
  // Uno de los seis de la fila de iconos de la cabecera. Macros vive en la
  // ÚLTIMA fila del encabezado, así que su panel nace justo debajo de ella —el
  // mismo sitio que los cinco de arriba— y no la tapa.
  const panel = usePanelFlotante('cabecera', 'menu');

  const load = async () => {
    setLoading(true);
    const res = await getMacrosAction();
    if (res.success) {
      setMacros(res.data.filter((m) => m.enabled));
      setTotal(res.data.length);
    }
    setLoading(false);
    setLoaded(true);
  };

  const run = async (id: string) => {
    setRunning(id);
    try {
      await onRunMacro(id);
    } finally {
      setRunning(null);
      setAbierto(false);
    }
  };

  return (
    <DropdownMenu
      open={abierto}
      onOpenChange={(o) => {
        setAbierto(o);
        panel.alAbrir(o);
        if (o && !loaded) void load();
      }}
    >
      <DropdownMenuTrigger asChild ref={panel.disparador}>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 md:h-7 gap-1.5 px-2.5 text-sm"
          title="Macros"
          // De aquí sale el ancho de los SEIS paneles de la cabecera: su borde
          // izquierdo es el extremo de la fila de Macros y Acciones.
          {...{ [MARCA_DE_MACROS]: '' }}
        >
          <Zap className="h-3.5 w-3.5" />
          Macros
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent {...panel.props} className={cn("w-56", RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}>
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
          </div>
        ) : macros.length === 0 ? (
          // Solo se ofrecen las ACTIVAS; si todas están desactivadas se dice
          // eso, y no «no tienes macros», que manda a crear las que ya hay.
          <p className="px-2 py-2 text-xs text-muted-foreground">{elMensajeDelMenuDelChat(total, 0)}</p>
        ) : (
          macros.map((m) => (
            <DropdownMenuItem
              key={m.id}
              onSelect={(e) => {
                e.preventDefault();
                void run(m.id);
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: m.color || '#6366f1' }}
              />
              {/* El panel mide lo que va de Macros al filo derecho: un nombre
                  largo sale con «…», así que se lee entero al posar el cursor. */}
              <span className="flex-1 truncate" title={m.name}>{m.name}</span>
              {running === m.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            </DropdownMenuItem>
          ))
        )}
        <div className="my-1 border-t border-border/50" />
        {/* `Link` y no `<a>`: con un enlace a secas la plataforma entera se
            volvía a cargar para ir a una pantalla de la misma App. */}
        <DropdownMenuItem asChild>
          <Link href="/macros" className="flex items-center gap-2 cursor-pointer text-muted-foreground">
            <Settings2 className="h-3.5 w-3.5" />
            Gestionar macros
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
