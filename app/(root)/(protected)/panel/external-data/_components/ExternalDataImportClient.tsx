'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ClipboardPaste,
  Eye,
  FileSpreadsheet,
  Info,
  Loader2,
  RotateCcw,
  User,
  XCircle,
} from 'lucide-react';

import { importFromGoogleSheetUrl, previewGoogleSheet } from '@/actions/external-client-data-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ExternalClientDataImportResult } from '@/types/external-client-data';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface ClientOption {
  id: string;
  label: string;
  email: string;
}

interface Props {
  clients: ClientOption[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function ExternalDataImportClient({ clients }: Props) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [url, setUrl] = useState('');
  const [columnName, setColumnName] = useState('WHATSAPP');
  const [catalogMode, setCatalogMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedClient = clients.find((c) => c.id === selectedUserId);

  const addLog = (message: string, type: LogType) => {
    setLogs((prev) => [...prev, makeLog(message, type)]);
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
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
    setCatalogMode(false);
    setLogs([]);
    setResult(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
  };

  const handlePreview = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return toast.error('Ingresa la URL de Google Sheets');
    if (!trimmedUrl.includes('docs.google.com/spreadsheets')) {
      return toast.error('La URL no parece ser de Google Sheets');
    }
    setIsPreviewing(true);
    setPreviewHeaders([]);
    setPreviewRows([]);
    try {
      const res = await previewGoogleSheet(trimmedUrl, 5);
      if (!res.success || !res.headers) {
        toast.error(res.error ?? 'No se pudo leer la hoja');
        return;
      }
      setPreviewHeaders(res.headers);
      setPreviewRows(res.rows ?? []);
      const waCol = res.headers.find((h) =>
        ['whatsapp', 'telefono', 'teléfono', 'celular', 'movil', 'móvil', 'phone'].includes(h.toLowerCase())
      );
      if (waCol) setColumnName(waCol);
      toast.success(`${res.headers.length} columnas detectadas`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al previsualizar');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!selectedUserId) {
      toast.error('Selecciona un cliente antes de importar');
      return;
    }
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error('Ingresa la URL de Google Sheets');
      return;
    }
    if (!trimmedUrl.includes('docs.google.com/spreadsheets')) {
      toast.error('La URL no parece ser de Google Sheets');
      return;
    }

    setIsLoading(true);
    setResult(null);
    setLogs([]);

    const toastId = 'import-external-data';

    try {
      addLog(`Cliente destino: ${selectedClient?.label} (${selectedClient?.email})`, 'info');
      addLog('Validando URL de Google Sheets...', 'loading');
      await delay(500);
      addLog('URL válida detectada', 'success');

      addLog('Conectando con la hoja de cálculo...', 'loading');
      toast.loading('Importando datos...', { id: toastId });

      const res = await importFromGoogleSheetUrl(selectedUserId, trimmedUrl, {
        remoteJidColumn: columnName.trim() || 'WHATSAPP',
        source: 'google_sheets',
        catalogMode,
      });

      if (res.parseErrors?.length) {
        for (const err of res.parseErrors) {
          addLog(err, 'error');
        }
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
  const canImport = !!selectedUserId && !!url.trim() && !isLoading;

  return (
    <div className="space-y-4">
      {/* ── Tarjeta principal ── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Importar datos externos</CardTitle>
          </div>
          <CardDescription>
            Sincroniza información de clientes (cédula, correo, servicio, monto, etc.)
            desde Google Sheets. Los datos se guardan bajo el cliente seleccionado y
            el agente IA los usará automáticamente en cada conversación.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Selector de cliente */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Cliente destino
            </Label>
            <Select
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              disabled={isLoading}
            >
              <SelectTrigger className={!selectedUserId ? 'border-amber-500/50' : ''}>
                <SelectValue placeholder="Selecciona el cliente al que pertenecen los datos..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="font-medium">{c.label}</span>
                    <span className="ml-2 text-muted-foreground text-xs">{c.email}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedUserId && (
              <p className="text-xs text-muted-foreground">
                Los datos se guardarán bajo el userId:{' '}
                <code className="bg-muted px-1 rounded text-[10px]">{selectedUserId}</code>
              </p>
            )}
          </div>

          <Separator />

          {/* URL */}
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
          </div>

          {/* Tipo de importación */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de datos</Label>
            <Select
              value={catalogMode ? 'catalog' : 'clients'}
              onValueChange={(v) => {
                setCatalogMode(v === 'catalog');
                setColumnName(v === 'catalog' ? '' : 'WHATSAPP');
                setPreviewHeaders([]);
                setPreviewRows([]);
              }}
              disabled={isLoading}
            >
              <SelectTrigger className="max-w-72 text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clients" className="text-xs">
                  👤 Clientes — clave por número WhatsApp
                </SelectItem>
                <SelectItem value="catalog" className="text-xs">
                  📋 Catálogo / Referencia — clave por cualquier campo
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {catalogMode
                ? 'Todos los campos se guardan tal cual. El agente los busca por cualquier columna.'
                : 'Los datos se asocian al cliente por su número de WhatsApp.'}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={!url.trim() || isLoading || isPreviewing}
              className="gap-2 text-xs"
            >
              {isPreviewing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Eye className="h-3.5 w-3.5" />}
              {isPreviewing ? 'Leyendo...' : 'Ver columnas del sheet'}
            </Button>
          </div>

          {previewHeaders.length > 0 && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {catalogMode ? 'Columna clave (identificador único)' : 'Columna con el número WhatsApp'}
                </Label>
                <Select value={columnName} onValueChange={setColumnName} disabled={isLoading}>
                  <SelectTrigger className="max-w-64 text-xs h-8">
                    <SelectValue placeholder={catalogMode ? 'Selecciona la columna clave' : 'Selecciona la columna del teléfono'} />
                  </SelectTrigger>
                  <SelectContent>
                    {previewHeaders.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {previewHeaders.length} columnas detectadas.
                  {catalogMode
                    ? ' Selecciona el campo que identifica de forma única cada registro (ej: MEDIDA, SKU, CÓDIGO).'
                    : ' Selecciona cuál contiene el número de WhatsApp.'}
                </p>
              </div>

              {previewRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">
                    Vista previa ({previewRows.length} fila{previewRows.length !== 1 ? 's' : ''}):
                  </p>
                  <ScrollArea className="max-h-40">
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead>
                          <tr className="border-b">
                            {previewHeaders.map((h) => (
                              <th key={h} className={`px-2 py-1 text-left font-medium whitespace-nowrap ${h === columnName ? 'text-primary' : 'text-muted-foreground'}`}>
                                {h === columnName ? `📱 ${h}` : h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, i) => (
                            <tr key={i} className="border-b border-border/50">
                              {previewHeaders.map((h) => (
                                <td key={h} className="px-2 py-1 whitespace-nowrap max-w-32 truncate" title={row[h]}>
                                  {row[h] || <span className="text-muted-foreground/40">—</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {previewHeaders.length === 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="col-name" className="text-xs">Columna con el número WhatsApp</Label>
              <Input
                id="col-name"
                placeholder="WHATSAPP"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                disabled={isLoading}
                className="max-w-52 text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Usa &ldquo;Ver columnas del sheet&rdquo; para detectarlas automáticamente.
              </p>
            </div>
          )}

          <Separator />

          {/* Acciones */}
          <div className="flex items-center gap-2">
            <Button onClick={handleImport} disabled={!canImport} className="gap-2">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
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

      {/* ── Log de actividad ── */}
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
                    <span className="text-muted-foreground/60 shrink-0 w-16 pt-0.5">
                      {log.time}
                    </span>
                    {LOG_ICONS[log.type]}
                    <span className={LOG_TEXT_COLOR[log.type]}>{log.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* ── Resumen de resultados ── */}
      {result && !isLoading && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-3 pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-sm font-medium">Resumen de importación</CardTitle>
              {selectedClient && (
                <Badge variant="outline" className="ml-auto text-xs">
                  {selectedClient.label}
                </Badge>
              )}
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
                  <Badge key={i} variant="destructive" className="text-xs font-normal">
                    {e}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
