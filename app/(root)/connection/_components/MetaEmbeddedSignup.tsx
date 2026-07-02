'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FaFacebook, FaWhatsapp } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  exchangeMetaSignup,
  selectMetaNumber,
  type MetaNumberOption,
} from '@/actions/meta-signup-actions';
import { toast } from 'sonner';

/**
 * Botón "Conectar con Facebook" que ejecuta el Embedded Signup oficial de Meta
 * (WhatsApp Cloud API en COEXISTENCIA). Automatiza lo que antes se pegaba a mano:
 * el usuario aprueba en el popup de Meta y nosotros recibimos el número + WABA +
 * un `code` que el servidor cambia por un token permanente.
 *
 * Requiere en el entorno:
 *   - NEXT_PUBLIC_META_APP_ID     (App ID de tu app de Meta)
 *   - NEXT_PUBLIC_META_CONFIG_ID  (ID de la configuración de Embedded Signup)
 * Mientras no existan, el botón se muestra deshabilitado con una nota.
 */

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const GRAPH_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v21.0';
// 'whatsapp_business_app_onboarding' = coexistencia (app + API en el mismo número).
const FEATURE_TYPE =
  process.env.NEXT_PUBLIC_META_FEATURE_TYPE || 'whatsapp_business_app_onboarding';

let sdkPromise: Promise<void> | null = null;

/**
 * Devuelve el redirect_uri REAL que usa el SDK de JS: la URL del iframe "xd_arbiter"
 * que Facebook inyecta, SIN el fragmento (#...) porque el navegador no lo envía y
 * Meta lo ignora al validar. Es el valor que debe usarse al intercambiar el code.
 */
function getFbChannelRedirect(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  try {
    const iframe = document.querySelector(
      'iframe[src*="xd_arbiter"]',
    ) as HTMLIFrameElement | null;
    return iframe?.src ? iframe.src.split('#')[0] : undefined;
  } catch {
    return undefined;
  }
}

/** Carga el SDK de Facebook una sola vez y resuelve cuando window.FB está listo. */
function loadFacebookSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    if (!APP_ID) {
      reject(new Error('APP_ID no configurado'));
      return;
    }
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: APP_ID,
        cookie: true,
        xfbml: false,
        version: GRAPH_VERSION,
      });
      resolve();
    };
    const id = 'facebook-jssdk';
    if (document.getElementById(id)) return; // ya se está cargando
    const js = document.createElement('script');
    js.id = id;
    js.src = 'https://connect.facebook.net/en_US/sdk.js';
    js.async = true;
    js.defer = true;
    js.crossOrigin = 'anonymous';
    js.onerror = () => reject(new Error('No se pudo cargar el SDK de Facebook'));
    document.body.appendChild(js);
  });

  return sdkPromise;
}

interface MetaEmbeddedSignupProps {
  userId: string;
  instanceName: string;
  className?: string;
  onConnected?: () => void;
}

export function MetaEmbeddedSignup({
  userId,
  instanceName,
  className,
  onConnected,
}: MetaEmbeddedSignupProps) {
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  // Datos que llegan por el evento `message` (antes que el callback del código).
  const sessionInfo = useRef<{ phoneNumberId?: string; wabaId?: string }>({});
  // Selector de número (cuando el usuario autorizó varias cuentas/números).
  const [picker, setPicker] = useState<{
    numbers: MetaNumberOption[];
    instanceDbId: string;
    selectedId: string;
  } | null>(null);
  const [selecting, setSelecting] = useState(false);

  const configured = Boolean(APP_ID && CONFIG_ID);

  // Escucha el evento WA_EMBEDDED_SIGNUP que trae phone_number_id + waba_id.
  useEffect(() => {
    if (!configured) return;
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== 'https://www.facebook.com' &&
        event.origin !== 'https://web.facebook.com'
      ) {
        return;
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        // Capturamos los IDs de CUALQUIER evento WA_EMBEDDED_SIGNUP que los traiga
        // (FINISH, FINISH_ONLY_WABA, onboarding de coexistencia, etc.), no solo FINISH.
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          const d = data.data ?? {};
          if (d.phone_number_id || d.waba_id) {
            sessionInfo.current = {
              phoneNumberId: d.phone_number_id ?? sessionInfo.current.phoneNumberId,
              wabaId: d.waba_id ?? sessionInfo.current.wabaId,
            };
          }
        }
      } catch {
        // no era un mensaje del Embedded Signup; ignorar.
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [configured]);

  // Precarga el SDK cuando el componente monta (si está configurado).
  useEffect(() => {
    if (!configured) return;
    loadFacebookSdk()
      .then(() => setSdkReady(true))
      .catch(() => setSdkReady(false));
  }, [configured]);

  const handleClick = useCallback(async () => {
    if (!configured) {
      toast.error('La conexión oficial aún no está configurada (falta App ID / Config ID).');
      return;
    }
    setLoading(true);
    sessionInfo.current = {};
    try {
      await loadFacebookSdk();
    } catch {
      setLoading(false);
      toast.error('No se pudo cargar el SDK de Meta. Revisa tu conexión.');
      return;
    }

    // OJO: FB.login NO acepta un callback `async` (lanza
    // "Expression is of type asyncfunction, not function"). Debe ser una función
    // normal; el trabajo asíncrono va dentro de una IIFE con su propio try/finally
    // para que `loading` siempre se resetee aunque el server action falle.
    window.FB.login(
      (response: any) => {
        void (async () => {
          try {
            const code = response?.authResponse?.code;
            if (!code) {
              toast.error('Conexión cancelada.');
              return;
            }
            // phoneNumberId puede venir vacío si el evento WA_EMBEDDED_SIGNUP no
            // llegó; en ese caso el servidor lo descubre con el token. No abortamos.
            const { phoneNumberId, wabaId } = sessionInfo.current;
            const hadEventNumber = Boolean(phoneNumberId);
            const res = await exchangeMetaSignup({
              code,
              userId,
              phoneNumberId: phoneNumberId ?? '',
              wabaId: wabaId ?? '',
              instanceName,
              // URL de la página (sin query/hash): candidato de redirect_uri.
              redirectUri: window.location.origin + window.location.pathname,
              // redirect_uri REAL del SDK (iframe xd_arbiter): candidato principal.
              channelRedirectUri: getFbChannelRedirect(),
            });
            if (!res.success) {
              toast.error(res.message);
              return;
            }
            // Si el usuario NO eligió número en el popup y hay varios disponibles,
            // abrimos el selector para que escoja cuál conectar (evita tomar el
            // equivocado). Si solo hay uno, o ya vino del evento, se conecta directo.
            if (!hadEventNumber && (res.numbers?.length ?? 0) > 1 && res.instanceDbId) {
              setPicker({
                numbers: res.numbers!,
                instanceDbId: res.instanceDbId,
                selectedId: res.phoneNumberId ?? res.numbers![0].phoneNumberId,
              });
            } else {
              toast.success(res.message);
              onConnected?.();
            }
          } catch {
            toast.error('Error al conectar con Meta. Intenta de nuevo.');
          } finally {
            setLoading(false);
          }
        })();
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: FEATURE_TYPE,
          sessionInfoVersion: '3',
        },
      },
    );
  }, [configured, userId, instanceName, onConnected]);

  // Confirma el número elegido en el selector (cambia la instancia al número escogido).
  const confirmNumber = useCallback(async () => {
    if (!picker) return;
    const chosen = picker.numbers.find((n) => n.phoneNumberId === picker.selectedId);
    if (!chosen) return;
    setSelecting(true);
    const res = await selectMetaNumber({
      instanceDbId: picker.instanceDbId,
      phoneNumberId: chosen.phoneNumberId,
      wabaId: chosen.wabaId,
    });
    setSelecting(false);
    if (res.success) {
      setPicker(null);
      toast.success(res.message);
      onConnected?.();
    } else {
      toast.error(res.message);
    }
  }, [picker, onConnected]);

  return (
    <div className="w-full">
      <Button
        onClick={handleClick}
        disabled={loading || !configured || !sdkReady}
        className={className ?? 'w-full gap-2 bg-[#1877F2] text-white hover:bg-[#166FE5]'}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FaFacebook className="h-4 w-4" />}
        {loading ? 'Conectando…' : 'Conectar con Facebook'}
      </Button>
      {!configured && (
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Conexión oficial en preparación
        </p>
      )}

      {/* Selector: aparece cuando el usuario autorizó varios números. */}
      <Dialog open={Boolean(picker)} onOpenChange={(o) => !o && !selecting && setPicker(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Elige el número a conectar</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Autorizaste varias cuentas. Selecciona el número de WhatsApp que quieres usar por la
            API oficial.
          </p>
          <div className="max-h-[320px] space-y-2 overflow-y-auto py-2">
            {picker?.numbers.map((n) => {
              const active = n.phoneNumberId === picker.selectedId;
              return (
                <button
                  key={n.phoneNumberId}
                  type="button"
                  onClick={() =>
                    setPicker((p) => (p ? { ...p, selectedId: n.phoneNumberId } : p))
                  }
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    active ? 'border-[#1877F2] bg-[#1877F2]/5' : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <FaWhatsapp className="h-5 w-5 shrink-0 text-green-500" />
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      {n.displayPhone || n.phoneNumberId}
                    </div>
                    {n.verifiedName && (
                      <div className="text-xs text-muted-foreground">{n.verifiedName}</div>
                    )}
                  </div>
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                      active ? 'border-[#1877F2] bg-[#1877F2]' : 'border-muted-foreground/40'
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicker(null)} disabled={selecting}>
              Cancelar
            </Button>
            <Button
              onClick={confirmNumber}
              disabled={selecting}
              className="bg-[#1877F2] text-white hover:bg-[#166FE5]"
            >
              {selecting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Conectar este número
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
