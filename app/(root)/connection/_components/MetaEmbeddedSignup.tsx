'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FaFacebook } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { exchangeMetaSignup } from '@/actions/meta-signup-actions';
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
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.event === 'FINISH') {
          sessionInfo.current = {
            phoneNumberId: data.data?.phone_number_id,
            wabaId: data.data?.waba_id,
          };
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
            const { phoneNumberId, wabaId } = sessionInfo.current;
            if (!phoneNumberId) {
              toast.error('Meta no entregó el número. Vuelve a intentarlo y completa todos los pasos.');
              return;
            }
            const res = await exchangeMetaSignup({
              code,
              userId,
              phoneNumberId,
              wabaId: wabaId ?? '',
              instanceName,
            });
            if (res.success) {
              toast.success(res.message);
              onConnected?.();
            } else {
              toast.error(res.message);
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
    </div>
  );
}
