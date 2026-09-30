'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { guardarMiOrdenAction, leerMiOrdenAction } from '@/actions/orden-propio-actions';
import {
  moverEnLaListaCompleta,
  ordenDeLaLista,
  ordenarTarjetas,
  type OrdenGuardado,
} from '@/lib/orden-de-las-tarjetas';
import { comoOrdenGuardado, type TipoDeOrdenPropio } from '@/lib/orden-propio';

/**
 * El orden PROPIO de una lista, con su guardado optimista.
 *
 * Es `useOrdenDeTarjetas` (Proyectos, Diagramas) con otra llave: aquel guarda el
 * orden de la CUENTA y este el de la PERSONA (`lib/orden-propio.ts`). La
 * colocación y el arrastre salen de las MISMAS funciones puras, y la rejilla y
 * el asa son `RejillaOrdenable` y `TarjetaOrdenable`: con dos copias, el día que
 * se afinara el arrastre en una la otra se quedaría atrás.
 *
 * `inicial` es lo que la pantalla ya trajo del servidor, para no pintar la
 * lista en un orden y moverla al instante. Sin ella se lee al montar.
 */
export function useOrdenPropio(tipo: TipoDeOrdenPropio, inicial?: OrdenGuardado) {
  const [orden, setOrden] = useState<OrdenGuardado>(() => comoOrdenGuardado(inicial));

  useEffect(() => {
    if (inicial) return;
    let vivo = true;
    (async () => {
      try {
        const r = await leerMiOrdenAction(tipo);
        if (!vivo) return;
        if (r.success) setOrden(comoOrdenGuardado(r.data));
        else console.warn('[orden-propio] no se pudo cargar', { tipo, motivo: r.message });
      } catch (error) {
        console.warn('[orden-propio] el orden no llegó del servidor', { tipo, error });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [tipo, inicial]);

  /** Coloca la lista. Sin nada guardado la devuelve tal cual llegó. */
  const colocar = useCallback(
    <T,>(items: T[], idDe: (item: T) => string) => ordenarTarjetas(items, orden, idDe),
    [orden],
  );

  /**
   * Mueve al momento y avisa después; si el servidor dice que no, vuelve tal
   * cual estaba. `idsCompletos` es la lista ENTERA ya colocada, no la que se
   * ve: con una búsqueda puesta lo escondido conserva su sitio.
   */
  const mover = useCallback(
    async (idsCompletos: string[], arrastrada: string, soltadaSobre: string) => {
      const nuevos = moverEnLaListaCompleta(idsCompletos, arrastrada, soltadaSobre);
      if (nuevos === idsCompletos) return;

      const antes = orden;
      setOrden(ordenDeLaLista(nuevos));

      let res: { success: boolean; message?: string };
      try {
        res = await guardarMiOrdenAction(tipo, nuevos);
      } catch (error) {
        console.warn('[orden-propio] el orden no llegó al servidor', error);
        res = { success: false, message: 'No se pudo guardar el orden. Revisa la conexión.' };
      }
      if (!res.success) {
        setOrden(antes);
        toast.error(res.message ?? 'No se pudo guardar el orden.');
      }
    },
    [orden, tipo],
  );

  return useMemo(() => ({ orden, colocar, mover }), [orden, colocar, mover]);
}
