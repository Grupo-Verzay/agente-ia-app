'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Phone, Save, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getVoicebotConfig, setVoicebotConfig } from '@/actions/voicebot-actions';

// Plantillas claras por OBJETIVO de la llamada. Son punto de partida: el usuario
// las edita con sus datos reales. Escritas para HABLAR (cortas y directas).
const TEMPLATES: { key: string; label: string; text: string }[] = [
  {
    key: 'ventas',
    label: 'Ventas',
    text: `Eres el asistente telefónico de [EMPRESA]. Llamas a un cliente potencial.

OBJETIVO: despertar interés en [PRODUCTO/SERVICIO] y avanzar hacia una venta o una cita.

CÓMO HABLAR:
- Sé breve, cálido y natural. Una idea por frase.
- Haz UNA pregunta a la vez y escucha la respuesta.
- Resalta 1 o 2 beneficios concretos, no una lista larga.
- Si hay interés, ofrece el siguiente paso (cita, enviar info por WhatsApp).
- Si piden un enlace o cotización, envíalo por WhatsApp (no lo dictes).

DATOS CLAVE:
- Qué vendes: [...]
- Precio / promoción: [...]
- Diferencial: [...]`,
  },
  {
    key: 'citas',
    label: 'Agendar citas',
    text: `Eres el asistente telefónico de [EMPRESA]. Llamas para agendar una cita.

OBJETIVO: confirmar interés y dejar una cita agendada.

CÓMO HABLAR:
- Saluda, identifícate y di el motivo en una frase.
- Pregunta si tiene disponibilidad esta semana.
- Consulta los horarios disponibles y ofrécele 2 opciones.
- Cuando elija, crea la cita con la fecha y hora exactas.
- Confírmale día y hora al final.

DATOS CLAVE:
- Servicio / motivo de la cita: [...]
- Duración aproximada: [...]
- Dirección o si es virtual: [...]`,
  },
  {
    key: 'atencion',
    label: 'Atención al cliente',
    text: `Eres el asistente telefónico de [EMPRESA]. Atiendes a un cliente.

OBJETIVO: resolver su duda o solicitud con claridad y amabilidad.

CÓMO HABLAR:
- Saluda con calidez y pregunta en qué puedes ayudar.
- Escucha, confirma que entendiste y responde con datos reales.
- Si no sabes algo, ofrécele que un asesor lo contacte.
- Si necesita algo por escrito, envíalo por WhatsApp.

DATOS CLAVE:
- Horarios y canales de atención: [...]
- Preguntas frecuentes: [...]`,
  },
  {
    key: 'seguimiento',
    label: 'Seguimiento',
    text: `Eres el asistente telefónico de [EMPRESA]. Haces una llamada de seguimiento.

OBJETIVO: retomar el contacto y reactivar el interés.

CÓMO HABLAR:
- Recuerda brevemente el contacto anterior.
- Pregunta si pudo revisar la información o si tiene dudas.
- Según su respuesta, ofrece el siguiente paso (cita, enviar info).
- Sé breve y respeta su tiempo.

DATOS CLAVE:
- Sobre qué fue el contacto previo: [...]
- Próximo paso ideal: [...]`,
  },
];

export function CallAgentEditor() {
  const [prompt, setPrompt] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void getVoicebotConfig().then((r) => {
      if (r.success && r.data) setPrompt(r.data.prompt ?? '');
      setLoaded(true);
    });
  }, []);

  const applyTemplate = (text: string) => {
    if (prompt.trim() && !confirm('¿Reemplazar el contenido actual con esta plantilla?')) return;
    setPrompt(text);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const res = await setVoicebotConfig({ prompt });
    setSaving(false);
    if (!res.success) {
      toast.error(res.message ?? 'No se pudo guardar.');
      return;
    }
    setDirty(false);
    toast.success('Prompt del agente de llamadas guardado.');
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
      <div className="w-full space-y-4">
        {/* Encabezado */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/ia"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
              title="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Phone className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-tight">Agente de Llamadas (Voz)</h2>
                <p className="text-xs text-muted-foreground">Prompt exclusivo para las llamadas con IA</p>
              </div>
            </div>
          </div>
          <Button onClick={() => void save()} disabled={saving || !dirty} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
        </div>

        {/* Plantillas por objetivo */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            Plantillas según el objetivo de la llamada
          </div>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => applyTemplate(t.text)}
                className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-violet-500/50 hover:bg-violet-500/5"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Editor del prompt */}
        <div className="space-y-1.5">
          <Textarea
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); setDirty(true); }}
            onBlur={() => { if (dirty) void save(); }}
            placeholder={'Escribe cómo debe comportarse el agente EN LLAMADAS...\n\nUsa una plantilla de arriba como punto de partida y reemplaza los [DATOS] con la información de tu negocio.'}
            rows={20}
            className="min-h-[420px] resize-y text-sm leading-relaxed font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Este prompt es solo para llamadas; no afecta al agente de WhatsApp. Si lo dejas vacío, el bot usará el prompt del chat (puede sonar confuso). La voz y el tono se ajustan en <strong>Conexión</strong> y en tu <strong>Perfil → Instrucciones de voz</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
