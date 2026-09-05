'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaWhatsapp } from 'react-icons/fa';
import { Loader2, Save, PlugZap, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  guardarServidorWaha,
  borrarServidorWaha,
  probarServidorWaha,
  type WahaServerData,
} from '@/actions/admin/waha-server-actions';
import { toast } from 'sonner';

interface Props {
  servidor: WahaServerData;
}

/**
 * Servidor de WAHA ("WhatsApp V2"), uno para toda la plataforma.
 *
 * Va aqui, junto a los servidores de Evolution, porque es lo mismo: url + API
 * key de un proveedor. Y va en la BD y no en el stack para que cambiar una
 * credencial no cueste un redespliegue.
 */
export const WahaServerCard = ({ servidor }: Props) => {
  const router = useRouter();
  const [url, setUrl] = useState(servidor.url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const configurado = Boolean(servidor.url && servidor.tieneApiKey);

  const handleProbar = async () => {
    setProbando(true);
    const res = await probarServidorWaha({ url, apiKey });
    setProbando(false);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
  };

  const handleGuardar = async () => {
    setGuardando(true);
    const res = await guardarServidorWaha({ url, apiKey });
    setGuardando(false);
    if (res.success) {
      toast.success(res.message);
      setApiKey('');
      router.refresh();
    } else {
      toast.error(res.message);
    }
  };

  const handleBorrar = async () => {
    setBorrando(true);
    const res = await borrarServidorWaha();
    setBorrando(false);
    setConfirmarBorrado(false);
    if (res.success) {
      toast.success(res.message);
      setUrl('');
      setApiKey('');
      router.refresh();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FaWhatsapp className="h-5 w-5 shrink-0 text-green-500" />
              Servidor de WhatsApp V2 (WAHA)
            </CardTitle>
            {configurado ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Configurado
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
                Sin configurar
              </span>
            )}
          </div>
          <CardDescription>
            Uno para toda la plataforma. Mientras esté vacío, la conexión de WhatsApp V2 no se
            le ofrece a nadie y todo lo demás sigue igual.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="waha-url">URL del servidor</Label>
              <Input
                id="waha-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://waha.tudominio.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="waha-api-key">API key</Label>
              <Input
                id="waha-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={servidor.tieneApiKey ? 'Guardada — escribe para cambiarla' : 'Pega la API key'}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                {servidor.tieneApiKey
                  ? 'Déjalo vacío para conservar la que ya está guardada.'
                  : 'Viaja al servidor en la cabecera X-Api-Key. No se muestra nunca.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleProbar} disabled={probando || !url}>
              {probando ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="mr-1 h-4 w-4" />
              )}
              Probar conexión
            </Button>
            <Button onClick={handleGuardar} disabled={guardando || !url}>
              {guardando ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Guardar
            </Button>
            {configurado && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmarBorrado(true)}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Quitar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmarBorrado} onOpenChange={setConfirmarBorrado}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar el servidor de WhatsApp V2?</AlertDialogTitle>
            <AlertDialogDescription>
              La conexión de WhatsApp V2 deja de ofrecerse en Conexión. Las instancias que ya
              estén creadas dejarán de poder enviar y recibir hasta que vuelvas a configurarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBorrar}
              disabled={borrando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {borrando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Sí, quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
