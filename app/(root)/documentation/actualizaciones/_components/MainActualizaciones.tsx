'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Megaphone, Paperclip, Trash2, Upload, X, Eye } from 'lucide-react';
import { CabeceraDeDocumentacion } from '@/components/documentacion/CabeceraDeDocumentacion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    CARPETA_DE_ACTUALIZACIONES,
    TOPE_DE_BYTES_DE_ACTUALIZACION,
    TOPE_DE_TEXTO,
    type Actualizacion,
    type ArchivoDeActualizacion,
} from '@/lib/actualizaciones';
import { comoSeLeeElNombre, comoSeLeeElTamano, elTipoConElQueSeGuarda } from '@/lib/adjuntos-del-equipo';
import {
    listarActualizacionesAction,
    publicarActualizacionAction,
    retirarActualizacionAction,
} from '@/actions/actualizaciones-actions';
import { ContenidoDeLaActualizacion } from '@/components/actualizaciones/ContenidoDeLaActualizacion';

/** El color de la tarjeta «Actualizaciones» en Documentación, el mismo aquí. */
const COLOR = '#F97316';

type ConVistas = Actualizacion & { vistas: number };

/**
 * Documentación › Actualizaciones.
 *
 * Arriba se escribe y se publica —un texto breve y, si se quiere, un video o un
 * documento—; debajo, lo ya publicado con cuántas personas lo vieron y la forma
 * de retirarlo. Lo publicado le salta UNA vez a cada persona que abra la
 * plataforma (`AvisoDeActualizacion`), y la vista previa de la lista es la
 * MISMA pieza que pinta esa ventana.
 */
export function MainActualizaciones({ cuentaId }: { cuentaId: string }) {
    const [texto, setTexto] = useState('');
    const [archivo, setArchivo] = useState<ArchivoDeActualizacion | null>(null);
    const [subiendo, setSubiendo] = useState(false);
    const [publicando, setPublicando] = useState(false);
    const [lista, setLista] = useState<ConVistas[]>([]);
    const [cargando, setCargando] = useState(true);
    const [aRetirar, setARetirar] = useState<ConVistas | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await listarActualizacionesAction();
            if (r.success) setLista(r.data);
            else toast.error(r.message ?? 'No se pudieron cargar las actualizaciones.');
        } catch (error) {
            console.error('[actualizaciones] no se pudo cargar la lista', error);
            toast.error('No se pudieron cargar las actualizaciones.');
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const subir = async (fichero: File) => {
        if (fichero.size > TOPE_DE_BYTES_DE_ACTUALIZACION) {
            toast.error('El archivo pasa de 200 MB.');
            return;
        }
        setSubiendo(true);
        try {
            const datos = new FormData();
            datos.append('file', fichero);
            datos.append('userID', cuentaId);
            datos.append('workflowID', CARPETA_DE_ACTUALIZACIONES);
            const r = await fetch('/api/upload', { method: 'POST', body: datos });
            const json = await r.json().catch(() => ({}));
            if (!r.ok || !json?.url) throw new Error(json?.error ?? `HTTP ${r.status}`);
            // El tipo se decide con la MISMA regla con la que la subida lo
            // guarda en el bucket: el de verdad, no el de la extensión.
            const cabecera = new Uint8Array(await fichero.slice(0, 16).arrayBuffer());
            const mime = elTipoConElQueSeGuarda(fichero.name, fichero.type, cabecera);
            setArchivo({ url: json.url, nombre: fichero.name, mime, tamano: fichero.size });
        } catch (error) {
            console.error('[actualizaciones] no se pudo subir el archivo', error);
            toast.error('No se pudo subir el archivo. Inténtalo de nuevo.');
        } finally {
            setSubiendo(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const publicar = async () => {
        if (!texto.trim() || publicando || subiendo) return;
        setPublicando(true);
        try {
            const r = await publicarActualizacionAction({ texto, archivo });
            if (!r.success) {
                toast.error(r.message ?? 'No se pudo publicar.');
                return;
            }
            toast.success('Actualización publicada. Le saldrá a cada persona al abrir la plataforma.');
            setTexto('');
            setArchivo(null);
            await cargar();
        } catch (error) {
            console.error('[actualizaciones] no se pudo publicar', error);
            toast.error('No se pudo publicar la actualización.');
        } finally {
            setPublicando(false);
        }
    };

    const retirar = async () => {
        if (!aRetirar) return;
        const id = aRetirar.id;
        setARetirar(null);
        const antes = lista;
        setLista((l) => l.filter((a) => a.id !== id));
        try {
            const r = await retirarActualizacionAction(id);
            if (!r.success) {
                setLista(antes);
                toast.error(r.message ?? 'No se pudo retirar.');
            } else toast.success('Actualización retirada.');
        } catch (error) {
            setLista(antes);
            console.error('[actualizaciones] no se pudo retirar', error);
            toast.error('No se pudo retirar la actualización.');
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4" data-pantalla-de-actualizaciones>
            <CabeceraDeDocumentacion titulo="Actualizaciones" />

            {/* Publicar */}
            <div
                className="flex flex-col gap-4 rounded-2xl border border-border bg-background p-5"
                style={{ borderTop: `3px solid ${COLOR}` }}
                data-formulario-de-actualizacion
            >
                <div className="flex flex-col gap-2">
                    <label htmlFor="texto-actualizacion" className="text-sm font-medium">
                        Texto
                    </label>
                    <Textarea
                        id="texto-actualizacion"
                        value={texto}
                        maxLength={TOPE_DE_TEXTO}
                        onChange={(e) => setTexto(e.target.value)}
                        placeholder="Qué cambió y por qué conviene mirarlo."
                        className="min-h-24"
                    />
                    <span className="self-end text-xs text-muted-foreground">
                        {texto.length}/{TOPE_DE_TEXTO}
                    </span>
                </div>

                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Video o documento explicativo (opcional)</span>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="video/*,image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                        className="hidden"
                        data-input-de-archivo
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void subir(f);
                        }}
                    />
                    {archivo ? (
                        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/40 p-3" data-archivo-elegido>
                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-sm" title={archivo.nombre}>
                                {comoSeLeeElNombre(archivo.nombre)}
                                {comoSeLeeElTamano(archivo.tamano) && (
                                    <span className="ml-2 text-xs text-muted-foreground">{comoSeLeeElTamano(archivo.tamano)}</span>
                                )}
                            </span>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setArchivo(null)} aria-label="Quitar archivo">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <Button
                            variant="outline"
                            className="w-full justify-center sm:w-auto sm:self-start"
                            disabled={subiendo}
                            onClick={() => inputRef.current?.click()}
                            data-boton-subir
                        >
                            {subiendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            {subiendo ? 'Subiendo…' : 'Subir archivo'}
                        </Button>
                    )}
                </div>

                <div className="flex justify-end">
                    <Button
                        onClick={publicar}
                        disabled={!texto.trim() || publicando || subiendo}
                        style={{ backgroundColor: COLOR, borderColor: COLOR }}
                        className="text-white"
                        data-boton-publicar
                    >
                        {publicando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
                        {publicando ? 'Publicando…' : 'Publicar'}
                    </Button>
                </div>
            </div>

            {/* Publicadas */}
            <div className="flex flex-col gap-3" data-lista-de-actualizaciones>
                <h3 className="text-sm font-semibold text-muted-foreground">Publicadas</h3>
                {cargando ? (
                    <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : lista.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Todavía no se ha publicado ninguna actualización.</p>
                ) : (
                    lista.map((a, i) => (
                        <div key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4" data-actualizacion={a.id}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">
                                    {new Date(a.publicadaEn).toLocaleString('es')}
                                    {a.publicadaPor ? ` · ${a.publicadaPor}` : ''}
                                    {i === 0 && (
                                        <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: COLOR }}>
                                            Vigente
                                        </span>
                                    )}
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Personas que ya la vieron o la cerraron">
                                        <Eye className="h-3.5 w-3.5" />
                                        {a.vistas}
                                    </span>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setARetirar(a)} aria-label="Retirar">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </span>
                            </div>
                            <ContenidoDeLaActualizacion actualizacion={a} />
                        </div>
                    ))
                )}
            </div>

            <AlertDialog open={Boolean(aRetirar)} onOpenChange={(o) => !o && setARetirar(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Retirar esta actualización?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deja de salir a quien todavía no la ha visto.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={retirar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Retirar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
