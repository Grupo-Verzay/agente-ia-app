'use client';

import { useState } from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  GUION_DE_FABRICA,
  SECCIONES_DEL_GUION,
  TOPE_DE_UNA_SECCION,
  TOPE_DEL_SALUDO,
  type ClaveDelGuion,
  type GuionDeVideollamada,
} from '@/lib/guion-videollamada';
import { guardarElGuionDeVideollamadaAction } from '@/actions/guion-videollamada-actions';

/**
 * Entrenamiento › Agente IA › Videollamadas: el guion de Verzy, por cuenta.
 * Lo que se guarda aquí es lo que el avatar sigue (`elContexto`); en Tavus
 * solo queda lo técnico (voz, cara, réplica).
 */
export function GuionVideollamadaEditor({
  cuentaId,
  guionInicial,
  puedeEditar,
}: {
  cuentaId: string;
  guionInicial: GuionDeVideollamada;
  puedeEditar: boolean;
}) {
  const [guion, setGuion] = useState<GuionDeVideollamada>(guionInicial);
  const [seccion, setSeccion] = useState<ClaveDelGuion>('apertura');
  const [guardando, setGuardando] = useState(false);
  const [cambiado, setCambiado] = useState(false);

  const actual = SECCIONES_DEL_GUION.find((s) => s.clave === seccion)!;

  const cambiar = (siguiente: GuionDeVideollamada) => {
    setGuion(siguiente);
    setCambiado(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await guardarElGuionDeVideollamadaAction(cuentaId, guion);
      if (!r.success) {
        toast.error(r.message ?? 'No se pudo guardar el guion.');
        return;
      }
      setCambiado(false);
      toast.success('Guion de la videollamada guardado.');
    } catch (e) {
      console.error('[videollamada] no se pudo guardar el guion', e);
      toast.error('No se pudo guardar el guion.');
    } finally {
      setGuardando(false);
    }
  };

  const restaurar = () => {
    if (!confirm('¿Volver al guion de fábrica? Se pierde lo que escribiste al guardar.')) return;
    cambiar(GUION_DE_FABRICA);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto" data-guion-videollamada>
      <div className="w-full space-y-4 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Lo que dice <strong>Verzy</strong> en la videollamada con IA. La voz y la cara se configuran en Tavus.
          </p>
          {puedeEditar && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={restaurar} disabled={guardando} className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                Restaurar valores de fábrica
              </Button>
              <Button onClick={() => void guardar()} disabled={guardando || !cambiado} className="gap-1.5">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar
              </Button>
            </div>
          )}
        </div>

        {!puedeEditar && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Solo quien administra la cuenta puede cambiar el guion.
          </p>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="saludo-videollamada">Saludo inicial</label>
          <Input
            id="saludo-videollamada"
            value={guion.saludo}
            maxLength={TOPE_DEL_SALUDO}
            readOnly={!puedeEditar}
            onChange={(e) => cambiar({ ...guion, saludo: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">
            Lo primero que dice Verzy al entrar. Vacío usa el de fábrica.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1" role="tablist" data-secciones-del-guion>
          {SECCIONES_DEL_GUION.map((s) => (
            <button
              key={s.clave}
              type="button"
              role="tab"
              aria-selected={s.clave === seccion}
              data-seccion={s.clave}
              onClick={() => setSeccion(s.clave)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                s.clave === seccion ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s.titulo}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{actual.titulo}</p>
          <p className="text-xs text-muted-foreground">{actual.ayuda}</p>
          <Textarea
            value={guion.secciones[seccion]}
            maxLength={TOPE_DE_UNA_SECCION}
            readOnly={!puedeEditar}
            onChange={(e) => cambiar({ ...guion, secciones: { ...guion.secciones, [seccion]: e.target.value } })}
            rows={14}
            className="min-h-[320px] resize-y text-sm leading-relaxed"
          />
          <p className="text-[11px] text-muted-foreground">
            Puedes usar {'{saludo}'}, {'{segunda_pregunta}'}, {'{tomar_nota}'} y {'{agendar}'}. Una sección vacía usa la de fábrica.
          </p>
        </div>
      </div>
    </div>
  );
}
