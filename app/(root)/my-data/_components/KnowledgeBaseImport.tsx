'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { BookOpen, CheckCircle2, Loader2, RotateCcw, Scissors, XCircle } from 'lucide-react';
import { autoSplitAndImport } from '@/actions/knowledge-block-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  userId: string;
  onImported?: () => void;
}

type ImportResult = { created: number; blocks: { title: string; keywords: string[] }[] };

export function KnowledgeBaseImport({ userId, onImported }: Props) {
  const [rawText, setRawText] = useState('');
  const [separator, setSeparator] = useState('auto');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    const text = rawText.trim();
    if (!text) return toast.error('Pega el texto del catálogo primero');

    setIsLoading(true);
    setResult(null);
    const toastId = 'kb-import';
    toast.loading('Procesando bloques...', { id: toastId });

    try {
      const sep = separator === 'auto' ? undefined : separator;
      const res = await autoSplitAndImport(userId, text, sep);

      if (res.created === 0) {
        toast.warning('No se detectaron secciones. Prueba con otro separador.', { id: toastId });
      } else {
        toast.success(`${res.created} bloque(s) importados correctamente`, { id: toastId });
        setResult(res);
        onImported?.();
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al importar', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setRawText('');
    setSeparator('auto');
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Base de Conocimiento</CardTitle>
          </div>
          <CardDescription>
            El agente IA consulta estos bloques automáticamente según lo que pregunta el cliente, reduciendo el uso de tokens hasta 10×.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="kb-text">Pega tu catálogo o contenido estructurado</Label>
            <Textarea
              id="kb-text"
              placeholder={`### Producto A\nDescripción del producto A.\nPrecio: $100\n\n### Producto B\nDescripción del producto B.\nPrecio: $200`}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={isLoading}
              className="min-h-36 font-mono text-xs resize-y"
            />
            <p className="text-xs text-muted-foreground">
              El sistema detecta los separadores automáticamente. Cada sección se convierte en un bloque independiente.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Separador de secciones</Label>
            <Select value={separator} onValueChange={setSeparator} disabled={isLoading}>
              <SelectTrigger className="max-w-72 text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto" className="text-xs">
                  Automático (detecta ### --- o líneas vacías)
                </SelectItem>
                <SelectItem value="###" className="text-xs">
                  ### — Encabezados Markdown
                </SelectItem>
                <SelectItem value="---" className="text-xs">
                  --- — Línea divisoria
                </SelectItem>
                <SelectItem value="\n\n" className="text-xs">
                  Línea en blanco doble
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Cada bloque guardado incluye título, palabras clave generadas automáticamente y el contenido completo.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {(rawText || result) && !isLoading && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="gap-1.5 text-muted-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Limpiar
                </Button>
              )}
              <Button
                onClick={handleImport}
                disabled={!rawText.trim() || isLoading}
                className="gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Scissors className="h-4 w-4" />
                )}
                {isLoading ? 'Procesando...' : 'Importar y dividir'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && !isLoading && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-3 pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-sm font-medium">Importación completada</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 w-fit">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-xl font-bold text-emerald-500 leading-none">{result.created}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Bloques creados</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">Bloques detectados:</p>
              <div className="space-y-1">
                {result.blocks.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <XCircle className="h-3 w-3 mt-0.5 text-muted-foreground/40 shrink-0 hidden" />
                    <span className="text-muted-foreground shrink-0 w-5">{i + 1}.</span>
                    <span className="font-medium">{b.title}</span>
                    <div className="flex flex-wrap gap-1 ml-1">
                      {b.keywords.slice(0, 5).map((kw) => (
                        <Badge key={kw} variant="secondary" className="text-[10px] px-1 py-0">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
