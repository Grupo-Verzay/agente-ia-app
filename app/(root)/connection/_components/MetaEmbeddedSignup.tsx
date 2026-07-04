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

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const GRAPH_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v21.0';
const FEATURE_TYPE =
  process.env.NEXT_PUBLIC_META_FEATURE_TYPE || 'whatsapp_business_app_onboarding';

function openCenteredPopup(url: string, name: string) {
  const width = 760;
  const height = 760;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  return window.open(
    url,
    name,
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`,
  );
}

function waitForOAuthCode(popup: Window, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        reject(new Error('Conexion cancelada.'));
        return;
      }
      if (Date.now() - startedAt > 5 * 60 * 1000) {
        window.clearInterval(timer);
        popup.close();
        reject(new Error('La conexion tardo demasiado. Intenta de nuevo.'));
        return;
      }
      try {
        const url = new URL(popup.location.href);
        if (url.origin !== window.location.origin) return;
        const error = url.searchParams.get('error_description') || url.searchParams.get('error');
        if (error) {
          window.clearInterval(timer);
          popup.close();
          reject(new Error(error));
          return;
        }
        const state = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        if (state === expectedState && code) {
          window.clearInterval(timer);
          popup.close();
          resolve(code);
        }
      } catch {
        // Mientras el popup esta en facebook.com no se puede leer su URL.
      }
    }, 500);
  });
}

interface MetaEmbeddedSignupProps {
  userId: string;
  instanceName: string;
  className?: string;
  onConnected?: () => void;
  mode?: 'coexistence' | 'api';
  label?: string;
}

export function MetaEmbeddedSignup({
  userId,
  instanceName,
  className,
  onConnected,
  mode = 'coexistence',
  label,
}: MetaEmbeddedSignupProps) {
  const [loading, setLoading] = useState(false);
  const sessionInfo = useRef<{ phoneNumberId?: string; wabaId?: string }>({});
  const [picker, setPicker] = useState<{
    numbers: MetaNumberOption[];
    instanceDbId: string;
    selectedId: string;
  } | null>(null);
  const [selecting, setSelecting] = useState(false);

  const configured = Boolean(APP_ID && CONFIG_ID);

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
        // Ignorar mensajes que no sean del Embedded Signup.
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [configured]);

  const handleConnected = useCallback(
    (res: Awaited<ReturnType<typeof exchangeMetaSignup>>, hadEventNumber: boolean) => {
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      if (!hadEventNumber && (res.numbers?.length ?? 0) > 1 && res.instanceDbId) {
        setPicker({
          numbers: res.numbers!,
          instanceDbId: res.instanceDbId,
          selectedId: res.phoneNumberId ?? res.numbers![0].phoneNumberId,
        });
        return;
      }
      toast.success(res.message);
      onConnected?.();
    },
    [onConnected],
  );

  const handleClick = useCallback(async () => {
    if (!configured || !APP_ID || !CONFIG_ID) {
      toast.error('La conexion oficial aun no esta configurada (falta App ID / Config ID).');
      return;
    }

    setLoading(true);
    sessionInfo.current = {};

    const redirectUri = window.location.origin + window.location.pathname;
    const state =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const extras = {
      setup: {},
      ...(mode === 'coexistence' ? { featureType: FEATURE_TYPE } : {}),
      sessionInfoVersion: '3',
    };
    const params = new URLSearchParams({
      client_id: APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      config_id: CONFIG_ID,
      state,
      override_default_response_type: 'true',
      extras: JSON.stringify(extras),
    });
    const popup = openCenteredPopup(
      `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`,
      'meta-embedded-signup',
    );

    if (!popup) {
      setLoading(false);
      toast.error('El navegador bloqueo la ventana de Meta. Permite popups e intenta de nuevo.');
      return;
    }

    try {
      const code = await waitForOAuthCode(popup, state);
      const { phoneNumberId, wabaId } = sessionInfo.current;
      const hadEventNumber = Boolean(phoneNumberId);
      const res = await exchangeMetaSignup({
        code,
        userId,
        phoneNumberId: phoneNumberId ?? '',
        wabaId: wabaId ?? '',
        instanceName,
        redirectUri,
      });
      handleConnected(res, hadEventNumber);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al conectar con Meta.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [configured, handleConnected, instanceName, mode, userId]);

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
        disabled={loading || !configured}
        className={className ?? 'w-full gap-2 bg-[#1877F2] text-white hover:bg-[#166FE5]'}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FaFacebook className="h-4 w-4" />}
        {loading ? 'Conectando...' : (label ?? 'Conectar con Facebook')}
      </Button>

      <Dialog open={Boolean(picker)} onOpenChange={(o) => !o && !selecting && setPicker(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Elige el numero a conectar</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Autorizaste varias cuentas. Selecciona el numero de WhatsApp que quieres usar por la
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
              Conectar este numero
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
