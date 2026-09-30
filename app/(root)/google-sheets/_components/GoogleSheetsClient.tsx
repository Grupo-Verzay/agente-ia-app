'use client';

import { useRef, useState } from 'react';
import { TableIcon, Sheet, Pencil, ExternalLink, Copy, Check, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { saveUserSheetsUrl } from '@/actions/google-sheets-actions';
import { elEnlaceIncrustado, laHojaQueSeGuarda } from '@/lib/url-de-google-sheets';

interface Props {
  userId: string;
  initialSheetsUrl: string | null;
  /** El correo de la cuenta de servicio: con él tiene que estar compartida la hoja para que se escriba en ella. */
  serviceAccountEmail: string | null;
}

type Copiado = 'correo' | 'enlace' | null;

/**
 * La hoja de Google Sheets de la cuenta: se vincula aquí, se ve dentro de la
 * plataforma y recibe las respuestas de los formularios de citas (pestaña
 * «Registro cita», `booking-form-actions`).
 *
 * Qué es una hoja lo decide `laHojaQueSeGuarda`, la MISMA función que la
 * acción: la pantalla no manda nada que el servidor vaya a rechazar, y un
 * enlace que no sirve se dice con su motivo debajo del campo, que se queda a
 * la vista. Antes se guardaba cualquier cosa, el campo se escondía y la
 * pantalla se quedaba en blanco para siempre.
 */
export function GoogleSheetsClient({ userId, initialSheetsUrl, serviceAccountEmail }: Props) {
  const inicial = initialSheetsUrl ? laHojaQueSeGuarda(initialSheetsUrl) : null;
  const [guardada, setGuardada] = useState<string | null>(inicial?.ok ? inicial.url : null);
  const [borrador, setBorrador] = useState(inicial?.ok ? inicial.url : initialSheetsUrl ?? '');
  const [editando, setEditando] = useState(!inicial?.ok);
  const [motivo, setMotivo] = useState<string | null>(
    inicial && !inicial.ok ? `El enlace guardado no sirve. ${inicial.motivo}` : null,
  );
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState<Copiado>(null);
  const [preguntandoSiQuitar, setPreguntandoSiQuitar] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const hoja = guardada ? laHojaQueSeGuarda(guardada) : null;

  // En su `try`: sin HTTPS, o sin permiso, el portapapeles LANZA, y un botón
  // que al pulsarlo da error es peor que no tenerlo.
  async function copiar(texto: string, que: Exclude<Copiado, null>) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(que);
      toast.success(que === 'correo' ? 'Correo copiado' : 'Enlace copiado');
      setTimeout(() => setCopiado((c) => (c === que ? null : c)), 2000);
    } catch {
      toast.error('No se pudo copiar. Selecciónalo y cópialo con Ctrl+C.');
    }
  }

  async function guardar() {
    const elegida = laHojaQueSeGuarda(borrador);
    if (!elegida.ok) {
      setMotivo(elegida.motivo);
      campo.current?.focus();
      return;
    }
    setGuardando(true);
    setMotivo(null);
    try {
      const res = await saveUserSheetsUrl(userId, elegida.url);
      if (res.success && res.url) {
        setGuardada(res.url);
        setBorrador(res.url);
        setEditando(false);
        toast.success('Hoja vinculada');
      } else {
        setMotivo(res.error ?? 'No se pudo guardar el enlace. Inténtalo de nuevo.');
      }
    } catch {
      setMotivo('No se pudo guardar el enlace. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  /** Vuelve a lo guardado: con hoja, a verla; sin ella, el campo en blanco. */
  function cancelar() {
    setMotivo(null);
    if (guardada) {
      setBorrador(guardada);
      setEditando(false);
    } else {
      setBorrador('');
    }
  }

  /**
   * Quitar la hoja vinculada. No existía: «Guardar» se apaga con el campo
   * vacío, así que una hoja que ya no se usaba se quedaba vinculada para
   * siempre, recibiendo las respuestas de las citas. Guarda «sin hoja» por la
   * MISMA acción (vacío = sin hoja) y la hoja de Google no se toca.
   */
  async function quitar() {
    setGuardando(true);
    setMotivo(null);
    try {
      const res = await saveUserSheetsUrl(userId, '');
      if (res.success) {
        setGuardada(null);
        setBorrador('');
        setEditando(true);
        setPreguntandoSiQuitar(false);
        toast.success('Hoja quitada');
      } else {
        setPreguntandoSiQuitar(false);
        setMotivo(res.error ?? 'No se pudo quitar la hoja. Inténtalo de nuevo.');
      }
    } catch {
      setPreguntandoSiQuitar(false);
      setMotivo('No se pudo quitar la hoja. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  function cambiarDeHoja() {
    setEditando(true);
    setTimeout(() => campo.current?.focus(), 0);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4" data-pantalla-de-google-sheets>
      {editando && (
        <section data-tarjeta-de-vincular className="shrink-0 rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3 border-b pb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Sheet className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Google Sheets</p>
              <p className="text-xs text-muted-foreground">
                Tu hoja se ve aquí y recibe las respuestas de tus formularios de citas
              </p>
            </div>
          </div>

          <div className="space-y-5 pt-4">
            <div className="space-y-1.5" data-paso="compartir">
              <p className="app-typography-compact text-sm font-semibold text-foreground">
                1. Comparte tu hoja con este correo como Editor
              </p>
              {serviceAccountEmail ? (
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={serviceAccountEmail}
                    aria-label="Correo con el que compartir la hoja"
                    className="flex-1 font-mono text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    data-boton="copiar-correo"
                    aria-label="Copiar el correo"
                    title="Copiar el correo"
                    onClick={() => copiar(serviceAccountEmail, 'correo')}
                  >
                    {copiado === 'correo' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-destructive">No hay cuenta de servicio configurada. Contacta a soporte.</p>
              )}
            </div>

            <div className="space-y-1.5" data-paso="enlace">
              <p className="app-typography-compact text-sm font-semibold text-foreground">2. Pega el enlace de tu hoja</p>
              <Input
                ref={campo}
                value={borrador}
                onChange={(e) => {
                  setBorrador(e.target.value);
                  if (motivo) setMotivo(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void guardar();
                  }
                }}
                aria-label="Enlace de tu hoja de Google Sheets"
                aria-invalid={motivo ? true : undefined}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className={`font-mono text-sm${motivo ? ' border-destructive focus-visible:ring-destructive' : ''}`}
              />
              {motivo ? (
                <p className="text-xs text-destructive" data-motivo role="alert">
                  {motivo}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Cópialo de la barra de direcciones de tu hoja, con la pestaña que quieres ver abierta.
                </p>
              )}
            </div>
          </div>

          {/* Hijos DIRECTOS del pie: `justify-between` deja Cancelar a la
              izquierda, Guardar a la derecha y, con una hoja ya vinculada,
              «Quitar hoja» en MEDIO (el borde izquierdo es de cancelar). */}
          <div className="flex items-center justify-between gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={cancelar} disabled={guardando} data-boton="cancelar">
              Cancelar
            </Button>
            {guardada && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setPreguntandoSiQuitar(true)}
                disabled={guardando}
                data-boton="quitar"
              >
                <Unlink className="h-3.5 w-3.5" />
                Quitar hoja
              </Button>
            )}
            <Button
              type="button"
              variant="save"
              onClick={() => void guardar()}
              disabled={guardando || !borrador.trim()}
              data-boton="guardar"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </section>
      )}

      {hoja?.ok ? (
        <section
          data-hoja-vinculada
          className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
        >
          {/* Abrir, copiar el enlace y cambiar de hoja, SIEMPRE a la vista.
              Iban en una cajita flotante encima de la hoja, al 40 % de opacidad
              y con el lápiz sin rótulo: había que adivinar que estaban ahí. */}
          <div data-barra-de-la-hoja className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
              <Sheet className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="flex min-w-0 items-baseline gap-2">
              <p className="shrink-0 text-sm font-semibold">Tu hoja de cálculo</p>
              <p className="hidden min-w-0 truncate font-mono text-xs text-muted-foreground md:block" title={hoja.url}>
                {hoja.url}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button asChild size="sm" variant="ghost" data-boton="abrir">
                <a href={hoja.url} target="_blank" rel="noopener noreferrer" title="Abrir en Google Sheets">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Abrir</span>
                </a>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-boton="copiar-enlace"
                title="Copiar el enlace de la hoja"
                onClick={() => copiar(hoja.url, 'enlace')}
              >
                {copiado === 'enlace' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Copiar link</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-boton="cambiar"
                title="Cambiar de hoja"
                onClick={cambiarDeHoja}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cambiar hoja</span>
              </Button>
            </div>
          </div>
          <iframe
            data-hoja-incrustada
            src={elEnlaceIncrustado(hoja.id, hoja.pestana)}
            className="min-h-0 w-full flex-1 border-0"
            title="Tu hoja de Google Sheets"
          />
        </section>
      ) : (
        <div
          data-sin-hoja
          className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-muted-foreground"
        >
          <TableIcon className="h-10 w-10 opacity-20" />
          <div className="text-center">
            <p className="text-sm font-medium">Aún no hay una hoja vinculada</p>
            <p className="text-xs">Compártela con el correo de arriba y pega su enlace</p>
          </div>
        </div>
      )}

      <AlertDialog open={preguntandoSiQuitar} onOpenChange={(v) => !guardando && setPreguntandoSiQuitar(v)}>
        <AlertDialogContent data-confirmar-quitar>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar la hoja?</AlertDialogTitle>
            <AlertDialogDescription>
              La plataforma dejará de mostrarla aquí y de escribir en ella las respuestas de tus citas. Tu hoja no
              se borra: sigue en tu Google Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={guardando}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void quitar()}
              disabled={guardando}
              data-boton="confirmar-quitar"
            >
              {guardando ? 'Quitando…' : 'Quitar hoja'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
