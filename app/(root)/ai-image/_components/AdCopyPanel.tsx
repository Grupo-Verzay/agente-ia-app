'use client'

import { useState } from 'react'
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { LAS_REDES, laRedDelFormato, loQueCabeTodavia } from '@/lib/copy-del-anuncio'
import type { AdFormat } from './ad-generator.types'

interface AdCopyPanelProps {
  previewFormat: AdFormat
  copy: string
  onCopyChange: (texto: string) => void
  onRegenerate: () => void
  isGenerating: boolean
  error: string | null
  hasPreview: boolean
}

export const AdCopyPanel = ({
  previewFormat,
  copy,
  onCopyChange,
  onRegenerate,
  isGenerating,
  error,
  hasPreview,
}: AdCopyPanelProps) => {
  const [copiado, setCopiado] = useState(false)
  const red = LAS_REDES[laRedDelFormato(previewFormat)]
  const sobra = loQueCabeTodavia(copy, previewFormat)

  const copiarAlPortapapeles = async () => {
    try {
      // Sin `navigator.clipboard` —un origen sin HTTPS, un navegador que lo
      // niega— esto lanza. Un botón que da error al pulsarlo es peor que no
      // tenerlo, así que se dice qué hacer en vez de fallar en silencio.
      await navigator.clipboard.writeText(copy)
      setCopiado(true)
      toast.success('Texto copiado al portapapeles.')
      setTimeout(() => setCopiado(false), 2000)
    } catch (err) {
      console.warn('[ai-image] no se pudo copiar el texto', err)
      toast.error('Tu navegador no dejó copiar. Selecciona el texto y usa Ctrl+C.')
    }
  }

  return (
    <Card data-panel="copy-del-anuncio" className="flex shrink-0 flex-col overflow-hidden rounded-[28px] border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-background/95 px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="truncate text-lg font-semibold">Texto del post</CardTitle>
          {/* La red sale del formato de la vista previa, no de un mando propio:
              con dos, la imagen diría una cosa y el texto otra. */}
          <p className="truncate text-xs text-muted-foreground">
            Adaptado a {red.nombre}
            {copy ? ` · ${copy.length}/${red.topeDeCaracteres}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-xl"
            title="Copiar texto"
            aria-label="Copiar texto"
            data-boton="copiar-copy"
            disabled={!copy}
            onClick={copiarAlPortapapeles}
          >
            {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-xl"
            title="Volver a generar el texto"
            aria-label="Volver a generar el texto"
            data-boton="regenerar-copy"
            disabled={!hasPreview || isGenerating}
            onClick={onRegenerate}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 p-4 pt-4 lg:p-5">
        {!hasPreview ? (
          <p className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            El texto se escribe a partir de la imagen. Genera el anuncio y aparecerá aquí.
          </p>
        ) : (
          <>
            <Textarea
              value={copy}
              onChange={(e) => onCopyChange(e.target.value)}
              data-campo="copy-del-anuncio"
              aria-label="Texto del post"
              placeholder={
                isGenerating ? 'Escribiendo el texto…' : 'Todavía no hay texto. Vuelve a generarlo.'
              }
              className="min-h-[132px] resize-none rounded-2xl bg-background text-sm leading-relaxed"
              rows={6}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                Puedes editarlo antes de publicarlo.
              </p>
              {copy && sobra < 0 && (
                <p className="shrink-0 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  {Math.abs(sobra)} caracteres de más para {red.nombre}
                </p>
              )}
            </div>
          </>
        )}

        {/* El motivo se queda DEBAJO, no en un aviso que se va: quien vuelve al
            panel un minuto después tiene que poder saber por qué no hay texto. */}
        {error && (
          <p
            data-aviso="copy-fallido"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
          >
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
