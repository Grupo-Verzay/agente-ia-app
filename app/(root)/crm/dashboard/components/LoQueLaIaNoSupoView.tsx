'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  HelpCircle,
  Loader2,
  RefreshCw,
  UserRoundSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getInformeSinRespuesta } from '@/actions/informe-sin-respuesta-actions';
import { InsigniaDeCuenta } from '@/components/shared/InsigniaDeCuenta';
import type { PreguntaAgrupada } from '@/lib/lo-que-la-ia-no-supo';

/**
 * Lo que la IA no supo responder.
 *
 * Lo que se viene a hacer aquí es leer una pregunta y decidir si añadirla al
 * entrenamiento, así que la pantalla es una lista ordenada por cuántas veces
 * salió y nada más. Sin gráficas: un número junto a una frase ya dice lo que
 * hay que hacer.
 *
 * Las variantes —las otras formas en que se preguntó lo mismo— van **plegadas**.
 * Son lo que demuestra que el grupo está bien hecho, así que tienen que poder
 * verse; pero abiertas de serie convierten diez preguntas en cincuenta líneas.
 */

/** Cuánto atrás se mira. Un informe sin límite mezcla el entrenamiento de hace un año con el de ahora. */
const PERIODOS = [
  { dias: 7, texto: '7 días' },
  { dias: 30, texto: '30 días' },
  { dias: 90, texto: '90 días' },
  { dias: 0, texto: 'Todo' },
] as const;

function haceCuanto(fecha: Date): string {
  const segundos = Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 1000));
  if (segundos < 3600) return `hace ${Math.max(1, Math.floor(segundos / 60))} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  const dias = Math.floor(segundos / 86400);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

function FilaDePregunta({
  grupo,
  nombreDeLaCuenta,
}: {
  grupo: PreguntaAgrupada;
  /** Solo con la vista unificada; si no, va vacío y no se pinta nada. */
  nombreDeLaCuenta?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const tieneVariantes = grupo.variantes.length > 0;

  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 px-1.5 text-sm font-semibold tabular-nums text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
          title={`Preguntada ${grupo.veces} ${grupo.veces === 1 ? 'vez' : 'veces'}`}
        >
          {grupo.veces}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug break-words">{grupo.pregunta}</p>
          {nombreDeLaCuenta && (
            <div className="mt-1">
              <InsigniaDeCuenta nombre={nombreDeLaCuenta} />
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{haceCuanto(grupo.ultimaVez)}</span>
            {/* Los dos casos no significan lo mismo: uno le costó la
                conversación a un asesor y el otro no. */}
            {grupo.porEscalado > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <UserRoundSearch className="h-3 w-3 shrink-0" />
                {grupo.porEscalado} pasó a un asesor
              </span>
            )}
            {grupo.porNoSaber > 0 && (
              <span>{grupo.porNoSaber} se le dijo al cliente</span>
            )}
            {tieneVariantes && (
              <button
                type="button"
                onClick={() => setAbierta((v) => !v)}
                className="inline-flex items-center gap-0.5 hover:text-foreground"
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform', abierta && 'rotate-180')} />
                {grupo.variantes.length} {grupo.variantes.length === 1 ? 'variante' : 'variantes'}
              </button>
            )}
          </div>

          {abierta && tieneVariantes && (
            <ul className="mt-2 space-y-1 border-l-2 border-muted pl-3">
              {grupo.variantes.map((v, i) => (
                <li key={i} className="text-xs text-muted-foreground break-words">
                  {v}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function LoQueLaIaNoSupoView({
  userId,
  cuentas,
  unificado,
  nombresDeCuenta,
}: {
  userId: string;
  /** Las cuentas que el filtro del CRM tiene puestas. */
  cuentas: string[];
  /** Con una sola cuenta elegida esto se ve EXACTAMENTE como antes. */
  unificado: boolean;
  nombresDeCuenta: Record<string, string>;
}) {
  const [grupos, setGrupos] = useState<PreguntaAgrupada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dias, setDias] = useState<number>(30);
  const [alTope, setAlTope] = useState(false);

  // `join` y no el arreglo: llega uno nuevo en cada pintado del padre, así que
  // con el arreglo en las dependencias el informe se recargaría sin parar.
  const llaveDeCuentas = cuentas.join(',');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const desde =
        dias > 0 ? new Date(Date.now() - dias * 86400_000).toISOString() : null;
      const res = await getInformeSinRespuesta({
        userId,
        desde,
        cuentas: llaveDeCuentas ? llaveDeCuentas.split(',') : null,
      });
      if (!res.success) {
        setError(res.msg);
        setGrupos([]);
      } else {
        setGrupos(res.grupos);
        setAlTope(res.alTope);
      }
    } catch (e) {
      // Una acción no solo devuelve `success: false`: puede reventar, y sin esto
      // el «Cargando…» se queda puesto para siempre.
      console.warn('[informe] no se pudo pedir lo que la IA no supo', e);
      setError('No se pudo cargar el informe.');
      setGrupos([]);
    } finally {
      setCargando(false);
    }
  }, [userId, dias, llaveDeCuentas]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const veces = grupos.reduce((n, g) => n + g.veces, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Lo que la IA no supo responder</h3>
          <p className="text-xs text-muted-foreground">
            {cargando
              ? 'Cargando…'
              : grupos.length === 0
                ? 'Nada pendiente en este periodo'
                : `${grupos.length} ${grupos.length === 1 ? 'pregunta distinta' : 'preguntas distintas'}, ${veces} ${veces === 1 ? 'vez' : 'veces'} en total`}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {PERIODOS.map((p) => (
            <Button
              key={p.dias}
              variant={dias === p.dias ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDias(p.dias)}
              className="h-8 px-2.5 text-xs"
            >
              {p.texto}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void cargar()}
            disabled={cargando}
            className="h-8 w-8 px-0"
            title="Actualizar"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', cargando && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {alTope && (
        <p className="text-xs text-muted-foreground">
          Hay más de las que caben en un informe: se están contando las más recientes.
        </p>
      )}

      {cargando ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void cargar()}>
            Reintentar
          </Button>
        </div>
      ) : grupos.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center px-4">
          <HelpCircle className="h-7 w-7 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">Sin preguntas sin responder</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Aquí aparece lo que tu agente no supo contestar, para que puedas añadirlo a su
              entrenamiento.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.map((g) => (
            <FilaDePregunta
              key={g.grupoId}
              grupo={g}
              nombreDeLaCuenta={unificado ? nombresDeCuenta[g.cuentaId] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
