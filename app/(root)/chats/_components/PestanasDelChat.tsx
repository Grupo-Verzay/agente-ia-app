'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePanelFlotante } from '@/hooks/usePanelFlotante';
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU } from '@/lib/paneles-flotantes';
import { repartirLasPestanas, type RepartoDePestanas } from '@/lib/pestanas-del-chat';
import { cn } from '@/lib/utils';

export type PestanaDelChat = { id: string; nombre: string };

/**
 * Las pestañas de la conversación (Mensajes, Notas y una por integración), y
 * las que no caben, plegadas en «Más».
 *
 * Vive en un hueco `flex-1 min-w-0` de la fila de abajo de la cabecera, al lado
 * de Macros y Acciones, que van `shrink-0` y NO pasan por aquí: cuando falta
 * ancho cede esta lista, nunca ellos. La decisión es `repartirLasPestanas`
 * (pura); esto solo mide.
 *
 * # Se mide una fila FANTASMA, no la que se ve
 *
 * Las pestañas que se ven cambian con el reparto, así que medirlas a ellas
 * sería medir el resultado de la última decisión y oscilar. Hay una copia
 * invisible (`aria-hidden`, fuera del flujo) con TODAS las pestañas y el «Más»,
 * que es la que da los anchos; y un `ResizeObserver` sobre el hueco y sobre esa
 * copia, porque el hueco cambia con los paneles laterales y la copia con los
 * nombres de las integraciones y la fuente.
 */
export function PestanasDelChat({
  pestanas,
  activa,
  onCambiar,
  clasePestana,
}: {
  pestanas: PestanaDelChat[];
  activa: string;
  onCambiar: (id: string) => void;
  /** El relleno de cada pestaña: la fila del móvil y la de escritorio llevan el suyo. */
  clasePestana: string;
}) {
  const hueco = useRef<HTMLDivElement | null>(null);
  const fantasma = useRef<HTMLDivElement | null>(null);
  const ids = pestanas.map((p) => p.id);
  const llave = ids.join('|');
  const [reparto, setReparto] = useState<RepartoDePestanas<string>>({ visibles: ids, enMenu: [] });
  // El menú cuelga de SU botón como todos los de la conversación.
  const panel = usePanelFlotante('cabecera', 'menu');

  const medir = useCallback(() => {
    const h = hueco.current;
    const f = fantasma.current;
    if (!h || !f) return;
    const nodos = Array.from(f.querySelectorAll<HTMLElement>('[data-medida]'));
    const anchos = ids.map((id) => nodos.find((n) => n.dataset.medida === id)?.offsetWidth ?? NaN);
    const menu = f.querySelector<HTMLElement>('[data-medida-menu]')?.offsetWidth ?? 0;
    const siguiente = repartirLasPestanas(ids, anchos, activa, h.clientWidth, menu);
    setReparto((antes) =>
      antes.visibles.join('|') === siguiente.visibles.join('|') &&
      antes.enMenu.join('|') === siguiente.enMenu.join('|')
        ? antes
        : siguiente,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llave, activa]);

  useLayoutEffect(() => {
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => medir());
    if (hueco.current) ro.observe(hueco.current);
    if (fantasma.current) ro.observe(fantasma.current);
    return () => ro.disconnect();
  }, [medir]);

  const nombre = (id: string) => pestanas.find((p) => p.id === id)?.nombre ?? id;
  // Un reparto de otra lista (acaban de cambiar las integraciones) no vale: se
  // pintan todas hasta la próxima medida.
  const vigente = reparto.visibles.concat(reparto.enMenu).every((id) => ids.includes(id));
  const visibles = vigente ? reparto.visibles.filter((id) => ids.includes(id)) : ids;
  const enMenu = vigente ? reparto.enMenu.filter((id) => ids.includes(id)) : [];
  const activaPlegada = enMenu.includes(activa);

  const pestana = (id: string, medida = false) => (
    <button
      key={id}
      type="button"
      {...(medida ? { 'data-medida': id, tabIndex: -1 } : { 'data-pestana-del-chat': id })}
      onClick={medida ? undefined : () => onCambiar(id)}
      className={cn(
        clasePestana,
        'shrink-0 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
        activa === id
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {nombre(id)}
    </button>
  );

  const claseDelMenu = cn(
    clasePestana,
    'shrink-0 inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
  );

  return (
    <div ref={hueco} data-pestanas-del-chat className="relative flex min-w-0 flex-1 items-center overflow-hidden">
      {visibles.map((id) => pestana(id))}
      {enMenu.length > 0 && (
        <DropdownMenu onOpenChange={panel.alAbrir}>
          <DropdownMenuTrigger asChild ref={panel.disparador}>
            <button
              type="button"
              data-mas-pestanas
              title="Más pestañas"
              className={cn(
                claseDelMenu,
                activaPlegada
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {/* Si no queda ninguna fuera, el disparador dice cuál está puesta. */}
              {visibles.length === 0 ? nombre(activa) : 'Más'}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent {...panel.props} className={cn('w-48', RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}>
            {enMenu.map((id) => (
              <DropdownMenuItem
                key={id}
                data-pestana-plegada={id}
                onSelect={() => onCambiar(id)}
                className={cn('cursor-pointer', activa === id && 'font-semibold text-foreground')}
              >
                {nombre(id)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* La fila fantasma: todas las pestañas y el «Más», sin ocupar sitio. */}
      <div
        ref={fantasma}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex w-max items-center"
      >
        {ids.map((id) => pestana(id, true))}
        <span data-medida-menu className={cn(claseDelMenu, 'border-transparent')}>
          Más
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}
