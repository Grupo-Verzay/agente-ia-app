'use client';

import { useState } from 'react';
import { Zap, Loader2, Settings2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { getMacrosAction, type MacroData } from '@/actions/macro-actions';

interface Props {
  /** Ejecuta la macro (el padre ya tiene la sesión + contexto del chat). */
  onRunMacro: (macroId: string) => Promise<void>;
}

export function MacrosMenu({ onRunMacro }: Props) {
  const [macros, setMacros] = useState<MacroData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await getMacrosAction();
    if (res.success) setMacros(res.data.filter((m) => m.enabled));
    setLoading(false);
    setLoaded(true);
  };

  const run = async (id: string) => {
    setRunning(id);
    try {
      await onRunMacro(id);
    } finally {
      setRunning(null);
    }
  };

  return (
    <DropdownMenu onOpenChange={(o) => { if (o && !loaded) void load(); }}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" className="h-8 gap-1.5 px-2.5 text-sm" title="Macros">
          <Zap className="h-3.5 w-3.5" />
          Macros
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
          </div>
        ) : macros.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            No tienes macros aún. Créalas en “Gestionar macros”.
          </p>
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
              <span className="flex-1 truncate">{m.name}</span>
              {running === m.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            </DropdownMenuItem>
          ))
        )}
        <div className="my-1 border-t border-border/50" />
        <DropdownMenuItem asChild>
          <a
            href="/macros"
            className="flex items-center gap-2 cursor-pointer text-muted-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Gestionar macros
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
