'use client';

import { CalendarDays } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GrupoDeOpciones } from '@/components/shared/GrupoDeOpciones';
import { cn } from '@/lib/utils';
import { elRotuloDelPeriodo, losExtremosDelMes, type ModoDePeriodo, type Periodo } from '@/lib/periodo-de-finanzas';

/**
 * El periodo de una lista de Finanzas: todo, un mes o un rango. Lo usan Ventas,
 * Gastos y Cuentas, en el hueco `filtros` de la barra —es lo que acota la
 * lista— y con el alto de la barra (40 px).
 *
 * Ventas y Gastos lo llevaban en el hueco de CREAR, pegado al azul y 8 px más
 * bajo que el resto de la fila; Cuentas, en una fila propia encima de la tabla.
 * La regla del periodo vive en `lib/periodo-de-finanzas.ts`.
 *
 * El botón dice lo que filtra («julio 2026», «1 jul – 15 jul», «Todas»): un
 * filtro que no lo dice obliga a abrirlo para saber qué se está mirando. Y se
 * pinta en azul cuando acota, como el resto de filtros puestos de la casa.
 */
const OPCIONES: { label: string; value: ModoDePeriodo }[] = [
  { label: 'Todo', value: 'todo' },
  { label: 'Mes', value: 'mes' },
  { label: 'Rango', value: 'rango' },
];

export function FiltroDePeriodo({
  periodo,
  alCambiar,
  queSon = 'Todo',
}: {
  periodo: Periodo;
  alCambiar: (p: Periodo) => void;
  /** Qué dice el botón sin filtro: «Todas», «Todos», «Todo». */
  queSon?: string;
}) {
  const acota = periodo.modo !== 'todo';

  const elegirModo = (modo: ModoDePeriodo) => {
    // Al pasar a «Rango» se parte del mes que se estaba mirando: un rango vacío
    // no acota nada y el botón diría «Todo» con el rango puesto.
    if (modo === 'rango' && !periodo.desde && !periodo.hasta) {
      const extremos = losExtremosDelMes(periodo.mes);
      alCambiar({ ...periodo, modo, desde: extremos?.desde ?? '', hasta: extremos?.hasta ?? '' });
      return;
    }
    alCambiar({ ...periodo, modo });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-10 shrink-0 gap-2 px-3 text-sm capitalize',
            acota && 'border-blue-600 text-blue-700 dark:text-blue-300',
          )}
          title="Filtrar por fecha"
          aria-label={`Filtrar por fecha: ${elRotuloDelPeriodo(periodo, queSon)}`}
          data-filtro-de-periodo
        >
          <CalendarDays className="h-4 w-4" />
          <span>{elRotuloDelPeriodo(periodo, queSon)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">Filtrar por fecha</p>
          <GrupoDeOpciones grupo="periodo" opciones={OPCIONES} valor={periodo.modo} alCambiar={elegirModo} />

          {periodo.modo === 'mes' ? (
            <Input
              type="month"
              aria-label="Mes"
              value={periodo.mes}
              onChange={(e) => e.target.value && alCambiar({ ...periodo, mes: e.target.value })}
              className="h-9 text-sm"
            />
          ) : null}

          {periodo.modo === 'rango' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Desde</span>
                <Input
                  type="date"
                  value={periodo.desde}
                  onChange={(e) => alCambiar({ ...periodo, desde: e.target.value })}
                  className="h-9 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Hasta</span>
                <Input
                  type="date"
                  value={periodo.hasta}
                  onChange={(e) => alCambiar({ ...periodo, hasta: e.target.value })}
                  className="h-9 text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
