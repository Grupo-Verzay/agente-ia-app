'use client';

import { useEffect, useRef, useState } from 'react';
import { AtSign, Lock } from 'lucide-react';
import { accesoALaConversacionAction } from '@/actions/acceso-por-mencion-actions';
import {
  laVistaDelInvitado,
  type MotivoDeAcceso,
  type VistaDelInvitado,
} from '@/lib/acceso-por-mencion';

/**
 * Cada cuánto se vuelve a preguntar si el invitado sigue dentro. Es el ritmo
 * de la lista de Chats: quitarle el acceso a alguien —o resolver la
 * conversación— no puede dejarle leyéndola media hora más.
 */
export const CADA_CUANTO_SE_REVISA_EL_ACCESO_MS = 20_000;

/**
 * Qué se le enseña a un AGENTE que tiene delante una conversación que no es
 * suya. Para quien no es agente, y para lo suyo o la bolsa, no pregunta nada:
 * el camino de siempre no paga ni una consulta.
 *
 * Una mención no cierra ninguna puerta que ya estuviera abierta: si el agente
 * llegó a una conversación ajena por otro camino (una tarea, una nota, la
 * búsqueda), se sigue viendo como hasta ahora. Lo único que se cierra es lo
 * que abrió una mención, cuando esa mención ya no vale.
 */
export function useAccesoDeInvitado(x: {
  esAgente: boolean;
  sessionId: number | null;
  personaId: string | null;
  asignadoA: string | null | undefined;
  puedeTomarSinAsignar: boolean;
  /** Se abrió por el enlace de una mención (el `?mencion=` apunta a ESTA). */
  entroPorMencion: boolean;
}): { vista: VistaDelInvitado; otorgadoPorNombre: string | null } {
  const [motivo, setMotivo] = useState<MotivoDeAcceso | null | undefined>(undefined);
  const [otorgadoPorNombre, setOtorgadoPor] = useState<string | null>(null);
  // Si alguna vez se vio como invitado, perder el acceso cierra la vista aunque
  // no haya entrado por el enlace.
  const fueInvitado = useRef<number | null>(null);

  // Lo suyo o la bolsa se sabe sin preguntar. Con la sesión todavía sin llegar
  // (`asignadoA === undefined`) se pregunta: el servidor lo sabe.
  const esSuyaOBolsa =
    x.asignadoA !== undefined &&
    ((x.asignadoA !== null && x.asignadoA === x.personaId) || (x.asignadoA === null && x.puedeTomarSinAsignar));
  const hayQuePreguntar = x.esAgente && Boolean(x.sessionId) && !esSuyaOBolsa;

  useEffect(() => {
    setMotivo(undefined);
    setOtorgadoPor(null);
    if (!hayQuePreguntar || !x.sessionId) return;
    const sesion = x.sessionId;
    let vivo = true;
    const preguntar = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const res = await accesoALaConversacionAction(sesion);
      // Un fallo no es «no puedes»: se conserva lo que había. Cerrar la
      // conversación por un tropiezo de red sería peor que no preguntar.
      if (!vivo || !res.success) return;
      if (res.motivo === 'mencion') fueInvitado.current = sesion;
      setMotivo(res.motivo);
      setOtorgadoPor(res.otorgadoPorNombre ?? null);
    };
    void preguntar();
    const reloj = window.setInterval(() => void preguntar(), CADA_CUANTO_SE_REVISA_EL_ACCESO_MS);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [hayQuePreguntar, x.sessionId]);

  if (!hayQuePreguntar) return { vista: 'normal', otorgadoPorNombre: null };
  return {
    vista: laVistaDelInvitado({
      motivo,
      entroPorMencion: x.entroPorMencion || fueInvitado.current === x.sessionId,
    }),
    otorgadoPorNombre,
  };
}

/** La franja que dice por qué se ve esta conversación. */
export function AvisoDeInvitado({ otorgadoPorNombre }: { otorgadoPorNombre: string | null }) {
  return (
    <div
      data-aviso-de-invitado
      className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
    >
      <AtSign className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        {otorgadoPorNombre ? `${otorgadoPorNombre} te mencionó aquí.` : 'Te mencionaron aquí.'} Puedes verla
        sin tenerla asignada; el acceso se quita al resolverla.
      </span>
    </div>
  );
}

/** Lo que se ve cuando el acceso de la mención ya no está. */
export function SinAccesoPorMencion() {
  return (
    <div
      data-sin-acceso-por-mencion
      className="flex h-full flex-1 flex-col items-center justify-center gap-3 border-l border-border bg-muted/10 px-8 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold text-foreground">Ya no tienes acceso a esta conversación</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Entraste porque te mencionaron. Ese acceso se quitó, o la conversación ya se resolvió. Si necesitas
        volver, pídele a quien la lleva que te mencione otra vez.
      </p>
    </div>
  );
}
