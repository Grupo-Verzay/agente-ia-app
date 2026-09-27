'use client';

import { useCallback, useEffect, useState } from 'react';
import { AtSign, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  accesosPorMencionAction,
  quitarAccesoPorMencionAction,
  type AccesoParaPintar,
} from '@/actions/acceso-por-mencion-actions';
import { colorFor, initials } from './ConversationParticipants';

/** El aviso con el que se pide volver a leer la lista (una nota con menciones). */
export const EVENTO_ACCESOS_POR_MENCION = 'verzay:accesos-por-mencion-changed';

/**
 * Quién entra a esta conversación porque lo MENCIONARON en una nota.
 *
 * Va en la sección de Participantes de la ficha, con la misma fila —avatar,
 * nombre y la equis al pasar el ratón— porque es la misma pregunta: quién más,
 * además del asignado, ve esta conversación. Lo que la distingue es el `@` y
 * que **se va sola al resolver**, que se dice debajo.
 *
 * La equis sale solo a quien puede quitarlo (el dueño de la conversación, quien
 * administra la cuenta, quien lo dio o el propio invitado): lo decide el
 * servidor, y lo vuelve a comprobar al quitar.
 *
 * Sin accesos no pinta nada: una sección vacía más en la ficha no dice nada.
 */
export function AccesosPorMencion({ sessionId }: { sessionId: number }) {
  const [accesos, setAccesos] = useState<AccesoParaPintar[]>([]);
  const [quitando, setQuitando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await accesosPorMencionAction(sessionId);
    if (res.success) setAccesos(res.data);
    else if (res.message) console.warn('[acceso por mención] no se pudo cargar', res.message);
  }, [sessionId]);

  useEffect(() => {
    void cargar();
    const alCambiar = () => void cargar();
    window.addEventListener(EVENTO_ACCESOS_POR_MENCION, alCambiar);
    return () => window.removeEventListener(EVENTO_ACCESOS_POR_MENCION, alCambiar);
  }, [cargar]);

  const quitar = useCallback(
    async (a: AccesoParaPintar) => {
      setQuitando(a.personaId);
      // Se quita de la lista al momento y vuelve si el servidor dice que no,
      // como el resto de acciones del asesor en Chats.
      const antes = accesos;
      setAccesos((prev) => prev.filter((x) => x.personaId !== a.personaId));
      const res = await quitarAccesoPorMencionAction(sessionId, a.personaId);
      if (res.success) toast.success(`${a.nombre || 'Esa persona'} ya no ve esta conversación.`);
      else {
        setAccesos(antes);
        toast.error(res.message);
      }
      setQuitando(null);
    },
    [accesos, sessionId],
  );

  if (!accesos.length) return null;

  return (
    <div className="mt-3 px-2" data-accesos-por-mencion>
      <p className="mb-1 flex items-center gap-1 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <AtSign className="h-3 w-3" /> Por mención
      </p>
      <ul className="flex flex-col gap-0.5">
        {accesos.map((a) => (
          <li
            key={a.personaId}
            data-acceso={a.personaId}
            className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-muted/60"
          >
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-background',
                colorFor(a.personaId),
              )}
            >
              {initials(a.nombre, null)}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-sm text-foreground"
              title={a.otorgadoPorNombre ? `Lo mencionó ${a.otorgadoPorNombre}` : undefined}
            >
              {a.nombre || 'Asesor'}
            </span>
            {a.sePuedeQuitar && (
              <button
                type="button"
                onClick={() => void quitar(a)}
                disabled={quitando !== null}
                aria-label={`Quitar el acceso de ${a.nombre || 'este asesor'}`}
                className="text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500 disabled:opacity-40"
                title="Quitar acceso"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 px-1.5 text-[11px] leading-snug text-muted-foreground">
        Pueden ver esta conversación sin tenerla asignada. El acceso se quita solo al resolverla.
      </p>
    </div>
  );
}
