'use client';

import { useCallback, useState } from 'react';
import { FileText, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PanelLateral } from '@/components/shared/PanelLateral';
import { PANEL_DE_LA_PROPUESTA } from '@/lib/panel-lateral';
import {
  crearYEnviarPropuestaDesdeElChatAction,
  propuestaDesdeElChatAction,
} from '@/actions/propuestas-actions';
import {
  FormularioDePropuesta,
  type BorradorDePropuesta,
  type LineaDelFormulario,
} from '@/app/(root)/(protected)/panel/propuestas/_components/FormularioDePropuesta';
import type { PlantillaDePlan } from '@/lib/plantillas-de-planes';

/** El id del `<form>` del panel: el botón del pie lo envía desde fuera. */
export const FORMULARIO_DE_LA_PROPUESTA_DEL_CHAT = 'formulario-de-propuesta-chat';

type Datos = {
  origen: string;
  lineas: LineaDelFormulario[];
  plantillas: PlantillaDePlan[];
  planes: Parameters<typeof FormularioDePropuesta>[0]['planesDelPanel'];
  cuenta: string;
};

/**
 * El icono de propuestas de la cabecera de una conversación. Abre el MISMO
 * formulario de Panel › Propuestas en un panel lateral, y su pie «Enviar por
 * WhatsApp» crea la propuesta en la cuenta dueña de la línea y la manda a ESTE
 * contacto por ESTA línea. El número y la línea los pone el servidor.
 */
export function ChatPropuestaPanel({
  instanceName,
  destino,
  pushName,
}: {
  instanceName?: string;
  /** A quién se le manda: el teléfono o el `@lid` de la conversación. */
  destino: string;
  pushName?: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const abrir = useCallback(async () => {
    setAbierto(true);
    setError(null);
    setCargando(true);
    try {
      const r = await propuestaDesdeElChatAction(instanceName ?? '');
      if (r.success && r.data) setDatos(r.data);
      else {
        setDatos(null);
        setError(('message' in r && r.message) || 'No se pudo abrir el formulario de la propuesta.');
      }
    } catch (e) {
      console.error('[propuestas] no se pudo abrir el panel del chat', e);
      setError('No se pudo abrir el formulario de la propuesta.');
    } finally {
      setCargando(false);
    }
  }, [instanceName]);

  const enviar = useCallback(
    async (b: BorradorDePropuesta) => {
      if (enviando) return;
      setEnviando(true);
      try {
        const r = await crearYEnviarPropuestaDesdeElChatAction(instanceName ?? '', destino, b);
        if (r.success && r.data) {
          toast.success(`Propuesta enviada por WhatsApp a ${r.data.a}.`);
          setAbierto(false);
        } else {
          toast.error(('message' in r && r.message) || 'No se pudo enviar la propuesta.');
        }
      } catch (e) {
        console.error('[propuestas] no se pudo enviar desde el chat', e);
        toast.error('No se pudo enviar la propuesta.');
      } finally {
        setEnviando(false);
      }
    },
    [enviando, instanceName, destino],
  );

  if (!instanceName || !destino) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void abrir()}
        data-boton-de-propuesta
        className="h-7 min-w-7 px-1 border-blue-300 bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-900"
        title="Enviar una propuesta comercial a este contacto"
        aria-label="Enviar una propuesta comercial a este contacto"
      >
        <FileText className="h-3.5 w-3.5" />
      </Button>

      <PanelLateral
        id={PANEL_DE_LA_PROPUESTA}
        abierto={abierto}
        onCerrar={() => !enviando && setAbierto(false)}
        titulo="Nueva propuesta"
        subtitulo={pushName ?? undefined}
        icono={<FileText className="h-4 w-4" />}
        cuerpoPropio
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {cargando ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="py-6 text-center text-sm text-muted-foreground" data-error-de-propuesta>
                {error}
              </p>
            ) : datos ? (
              <FormularioDePropuesta
                marco="panel"
                formId={FORMULARIO_DE_LA_PROPUESTA_DEL_CHAT}
                abierto={abierto}
                propuesta={null}
                lineas={datos.lineas}
                origen={datos.origen}
                plantillas={datos.plantillas}
                planesDelPanel={datos.planes}
                cuenta={datos.cuenta}
                guardando={enviando}
                onCerrar={() => setAbierto(false)}
                onGuardar={enviar}
              />
            ) : null}
          </div>
          {datos && !cargando && !error ? (
            <div
              className="shrink-0 border-t border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900 sm:px-3 sm:py-2"
              data-pie-de-propuesta
            >
              <Button
                type="submit"
                form={FORMULARIO_DE_LA_PROPUESTA_DEL_CHAT}
                disabled={enviando}
                className="h-10 w-full gap-1.5 bg-emerald-600 text-sm text-white hover:bg-emerald-700"
                data-enviar-propuesta
              >
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {enviando ? 'Enviando…' : 'Enviar por WhatsApp'}
              </Button>
            </div>
          ) : null}
        </div>
      </PanelLateral>
    </>
  );
}
