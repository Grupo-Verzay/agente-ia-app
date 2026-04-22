'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  FileSpreadsheet,
  Info,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { importFromGoogleSheetUrl } from '@/actions/external-client-data-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { ExternalClientDataImportResult } from '@/types/external-client-data';

type LogType = 'info' | 'success' | 'error' | 'loading';

interface LogEntry {
  id: number;
  time: string;
  message: string;
  type: LogType;
}

interface ImportResult extends ExternalClientDataImportResult {
  total: number;
}

interface Props {
  userId: string;
}

function nowTime() {
  return new Date().toLocaleTimeString('es-VE', { hour12: false });
}

let _logId = 0;
function makeLog(message: string, type: LogType): LogEntry {
  return { id: ++_logId, time: nowTime(), message, type };
}

const LOG_ICONS: Record<LogType, React.ReactNode> = {
  info: <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />,
  error: <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />,
  loading: <Loader2 className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5 animate-spin" />,
};

const LOG_TEXT_COLOR: Record<LogType, string> = {
  info: 'text-muted-foreground',
  success: 'text-emerald-400',
  error: 'text-red-400',
  loading: 'text-amber-400',
};

export function MyDataImport({ userId }: Props) {
  const [url, setUrl] = useState('');
  const [columnName, setColumnName] = useState('WHATSAPP');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string, type: LogType) => {
    setLogs((prev) => [...prev, makeLog(message, type)]);
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 50);
  };

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text.trim());
    } catch {
      toast.error('No se pudo acceder al portapapeles');
    }
  };

  const handleReset = () => {
    setUrl('');
    setColumnName('WHATSAPP');
    setLogs([]);
    setResult(null);
    setAdvancedOpen(false);
  };

  const handleImport = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return toast.error('Ingresa la URL de Google Sheets');
    if (!trimmedUrl.includes('docs.google.com/spreadsheets')) {
      return toast.error('La URL no parece ser de Google Sheets');
    }

    setIsLoading(true);
    setResult(null);
    setLogs([]);

    const toastId = 'my-data-import';

    try {
      addLog('Validando URL de Google Sheets...', 'loading');
      await delay(400);
      addLog('URL válida detectada', 'success');
      addLog('Conectando con la hoja de cálculo...', 'loading');
      toast.loading('Importando datos...', { id: toastId });

      const res = await importFromGoogleSheetUrl(userId, trimmedUrl, {
        remoteJidColumn: columnName.trim() || 'WHATSAPP',
        source: 'google_sheets',
      });

      if (res.parseErrors?.length) {
        for (const err of res.parseErrors) addLog(err, 'error');
        toast.error('Error al procesar la hoja', { id: toastId });
        return;
      }

      const total = res.created + res.updated + res.errors;
      addLog(`${total} fila(s) con número de WhatsApp encontradas`, 'info');
      if (res.created > 0) addLog(`${res.created} registro(s) nuevo(s) creado(s)`, 'success');
      if (res.updated > 0) addLog(`${res.updated} registro(s) actualizado(s)`, 'success');
      if (res.errors > 0) addLog(`${res.errors} fila(s) con errores omitidas`, 'error');
      addLog('Importación completada', 'success');
      setResult({ ...res, total });

      if (res.errors === 0) {
        toast.success(`Importación exitosa — ${total} registros procesados`, { id: toastId });
      } else {
        toast.warning(`Importación con advertencias — ${res.errors} error(es)`, { id: toastId });
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Error inesperado durante la importación';
      addLog(msg, 'error');
      toast.error(msg, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const hasLogs = logs.length > 0;
  const canImport = !!url.trim() && !isLoading;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Importar desde Google Sheets</CardTitle>
          </div>
          <CardDescription>
            Sincroniza información (cédula, correo, servicio, monto, etc.) desde una hoja de Google
            Sheets. El agente IA usará estos datos automáticamente en cada conversación.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sheet-url">URL de Google Sheets</Label>
            <div className="flex gap-2">
              <Input
                id="sheet-url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isLoading}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handlePaste}
                disabled={isLoading}
                title="Pegar desde portapapeles"
              >
                <ClipboardPaste className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              La hoja debe estar compartida como &ldquo;cualquiera con el enlace puede ver&rdquo;.
            </p>
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                disabled={isLoading}
              >
                {advancedOpen
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
                Opciones avanzadas
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="space-y-1.5 pl-0.5">
                <Label htmlFor="col-name" className="text-xs">
                  Nombre de la columna con el número WhatsApp
                </Label>
                <Input
                  id="col-name"
                  placeholder="WHATSAPP"
                  value={columnName}
                  onChange={(e) => setColumnName(e.target.value.toUpperCase())}
                  disabled={isLoading}
                  className="max-w-52 text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Por defecto <code className="bg-muted px-1 rounded">WHATSAPP</code>.
                  Cambia si tu hoja usa otro nombre de columna.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <div className="flex items-center gap-2">
            <Button onClick={handleImport} disabled={!canImport} className="gap-2">
              {isLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <FileSpreadsheet className="h-4 w-4" />}
              {isLoading ? 'Importando...' : 'Iniciar importación'}
            </Button>
            {(hasLogs || url) && !isLoading && (
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
          </div>
        </CardContent>
      </Card>

      {hasLogs && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Registro de actividad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48" ref={scrollRef as any}>
              <div className="space-y-1.5 pr-3 font-mono text-xs">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 shrink-0 w-16 pt-0.5">{log.time}</span>
                    {LOG_ICONS[log.type]}
                    <span className={LOG_TEXT_COLOR[log.type]}>{log.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {result && !isLoading && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-3 pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-sm font-medium">Resumen de importación</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-xl font-bold text-emerald-500 leading-none">{result.created}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Creados</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2">
                <RotateCcw className="h-4 w-4 text-blue-400" />
                <div>
                  <p className="text-xl font-bold text-blue-400 leading-none">{result.updated}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Actualizados</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                <XCircle className="h-4 w-4 text-red-400" />
                <div>
                  <p className="text-xl font-bold text-red-400 leading-none">{result.errors}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Errores</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2 ml-auto">
                <div>
                  <p className="text-xl font-bold leading-none">{result.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total</p>
                </div>
              </div>
            </div>
            {result.parseErrors && result.parseErrors.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.parseErrors.map((e, i) => (
                  <Badge key={i} variant="destructive" className="text-xs font-normal">{e}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
