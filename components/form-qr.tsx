'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getInstances, generateQRCode, generateWhatsappPairingCode } from '@/actions/api-action';
import { Button } from "@/components/ui/button";
import { QrScanDialog } from "@/components/shared/QrScanDialog";
import { QrCode, Phone, Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from 'next/navigation';
import { Skeleton } from './ui/skeleton';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { toast } from "sonner";

interface QRCodeGeneratorProps {
    instanceName: string;
    instanceId: string;
}

interface QRCodeGeneratorComponentProps {
    userId: string;
}

type EvoStatus = "connected" | "disconnected" | null;

const QRCodeGenerator: React.FC<QRCodeGeneratorComponentProps> = ({ userId }) => {
    const router = useRouter();
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [instanceData, setInstanceData] = useState<QRCodeGeneratorProps | null>(null);

    // Estado WhatsApp (open/close/etc)
    const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

    // Estado API Evolution (connected/disconnected)
    const [evoStatus, setEvoStatus] = useState<EvoStatus>(null);

    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Vinculación por número de teléfono (alternativa al QR).
    const [phoneOpen, setPhoneOpen] = useState(false);
    const [phoneInput, setPhoneInput] = useState('');
    const [phoneCode, setPhoneCode] = useState<string | null>(null);
    const [phoneLinking, setPhoneLinking] = useState(false);

    const isWhatsappConnected = connectionStatus === "open";
    const isApiDisconnected = evoStatus === "disconnected";

    const fetchQRCode = useCallback(async (instanceName: string) => {
        setLoading(true);

        const response = await generateQRCode({ instanceName, userId });

        //  siempre actualiza evoStatus si viene
        if (response?.evo?.status) {
            setEvoStatus(response.evo.status);
        }

        if (response?.success) {
            setError(null);

            setQrCode(response.qr?.code || null);
            setConnectionStatus(response.connectionState?.instance?.state || null);

            //  toast solo cuando el backend diga "recién notificado"
            if (response?.evo?.justNotified) {
                toast.error("Tu API de Evolution se encuentra desconectada. Revisa token/instancia/credenciales.");
            }

            router.refresh();
        } else {
            setQrCode(null);

            // si falla, normalmente es porque la API está caída/timeout
            setConnectionStatus(null);
            setError(response?.message || 'No se pudo validar el estado de Evolution.');
        }

        setLoading(false);
    }, [router, userId]);

    const closePhoneDialog = () => {
        setPhoneOpen(false);
        setPhoneLinking(false);
        setPhoneCode(null);
        // restaurar el poll normal (40s)
        if (intervalRef.current) clearInterval(intervalRef.current);
        const name = instanceData?.instanceName;
        if (name) intervalRef.current = setInterval(() => { void fetchQRCode(name); }, 40000);
    };

    const startPhonePairing = async () => {
        const digits = phoneInput.replace(/\D/g, '');
        if (digits.length < 8) { toast.error('Ingresa el número con código de país (ej. 573001234567).'); return; }
        const name = instanceData?.instanceName;
        if (!name) { toast.error('No hay instancia de WhatsApp.'); return; }
        setPhoneLinking(true); setPhoneCode(null);
        const res = await generateWhatsappPairingCode({ instanceName: name, userId, phone: digits });
        setPhoneLinking(false);
        if (!res.success || !res.pairingCode) { toast.error(res.message || 'No se pudo generar el código.'); return; }
        setPhoneCode(res.pairingCode);
        // poll rápido mientras esperamos la vinculación
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => { void fetchQRCode(name); }, 5000);
    };

    // Al conectar (open) con el diálogo de número abierto → cerrar y avisar.
    useEffect(() => {
        if (phoneOpen && connectionStatus === 'open') {
            toast.success('Número vinculado a WhatsApp. ✅');
            setPhoneOpen(false); setPhoneCode(null); setPhoneLinking(false);
        }
    }, [phoneOpen, connectionStatus]);

    useEffect(() => {
        let mounted = true;

        const loadInstances = async () => {
            if (!userId) return;
            setError(null);
            try {
                const instances = await getInstances(userId);
                if (!mounted) return;

                if (!Array.isArray(instances) || instances.length === 0) {
                    setError('No se encontraron instancias para este usuario. Contacta al administrador.');
                    setLoading(false);
                    return;
                }

                const whatsappIndex = instances.findIndex(i => i.instanceType === 'Whatsapp');
                if (whatsappIndex === -1) {
                    setError('No se encontró una instancia tipo Whatsapp para este usuario.');
                    setLoading(false);
                    return;
                }

                if (!instances[whatsappIndex].serverUrl) {
                    setError('Este usuario no tiene una API Key de Evolution asignada. Contacta al administrador.');
                    setLoading(false);
                    return;
                }

                const { instanceName, instanceId } = instances[whatsappIndex];
                setInstanceData({ instanceName, instanceId });

                await fetchQRCode(instanceName);

                if (intervalRef.current) clearInterval(intervalRef.current);
                intervalRef.current = setInterval(() => {
                    void fetchQRCode(instanceName);
                }, 40000);

            } catch (err) {
                setError('Error al cargar instancias: ' + (err instanceof Error ? err.message : String(err)));
                setLoading(false);
            }
        };

        void loadInstances();

        return () => {
            mounted = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [fetchQRCode, userId]);

    return (
        <>
            {loading ? (
                <Skeleton className="w-full h-10 rounded-md" />
            ) : (
                <Button
                    className={`w-full transition-all duration-300 ${isApiDisconnected
                            ? "ring-1 ring-red-500 shadow-[0_0_12px_#ef4444] hover:shadow-[0_0_18px_#ef4444]"
                            : !isWhatsappConnected
                                ? "shadow-[0_0_12px_#22c55e] hover:shadow-[0_0_18px_#22c55e] ring-1 ring-green-400"
                                : ""
                        }`}
                    onClick={() => setIsModalOpen(true)}
                    variant={isApiDisconnected ? "destructive" : isWhatsappConnected ? "save" : "secondary"}
                >
                    <QrCode className="mr-2 h-4 w-4" />
                    {isApiDisconnected ? "API desconectada" : isWhatsappConnected ? "Conectado" : "Conectar"}
                </Button>
            )}

            <QrScanDialog
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                title={
                    isApiDisconnected
                        ? "API de Evolution desconectada"
                        : isWhatsappConnected
                            ? "¡Conexión exitosa!"
                            : "Escanea el código QR"
                }
                description={
                    isApiDisconnected
                        ? undefined
                        : isWhatsappConnected
                            ? "Ya puedes usar la integración con WhatsApp."
                            : "Sigue las instrucciones antes de escanear el código QR."
                }
                loading={loading}
                error={
                    error
                        ? error
                        : isApiDisconnected
                            ? "Revisa tu configuración (token, instancia, credenciales) para restablecer la conexión."
                            : null
                }
                connected={isWhatsappConnected}
                connectedText="WhatsApp conectado correctamente"
                qr={qrCode ? <Image src={qrCode} alt="Código QR" width={296} height={296} /> : undefined}
                steps={[
                    <>Abre <span className="font-bold">WhatsApp</span> en tu teléfono.</>,
                    <>Toca <span className="font-bold">Dispositivos vinculados</span>.</>,
                    <><span className="font-bold">Vincular un nuevo dispositivo</span>.</>,
                    <>Apunta la <span className="font-bold">cámara</span> y escanea el <span className="font-bold">QR</span>.</>,
                    <>Si pide <span className="font-bold">llave de acceso</span> o <span className="font-bold">continuar en otro dispositivo</span>, sigue las indicaciones de tu teléfono.</>,
                ]}
                footer={
                    !isWhatsappConnected && !isApiDisconnected ? (
                        <button
                            type="button"
                            onClick={() => { setPhoneCode(null); setPhoneInput(''); setIsModalOpen(false); setPhoneOpen(true); }}
                            className="text-xs font-medium text-green-700 hover:underline dark:text-green-400"
                        >
                            o vincular con número de teléfono
                        </button>
                    ) : undefined
                }
            />

            {/* Vincular Mensajería por número de teléfono (código) */}
            <Dialog open={phoneOpen} onOpenChange={(o) => { if (!o) closePhoneDialog(); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-green-600" /> Vincular con número de teléfono
                        </DialogTitle>
                        <DialogDescription>
                            Alternativa al QR. Te damos un código que escribes en WhatsApp.
                        </DialogDescription>
                    </DialogHeader>

                    {!phoneCode ? (
                        <div className="flex flex-col gap-3">
                            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                                Número con código de país (sin +)
                                <Input
                                    value={phoneInput}
                                    onChange={(e) => setPhoneInput(e.target.value)}
                                    placeholder="573001234567"
                                    inputMode="tel"
                                    className="h-9"
                                />
                            </label>
                            <Button
                                className="w-full gap-2 bg-green-600 text-white hover:bg-green-700"
                                onClick={() => void startPhonePairing()}
                                disabled={phoneLinking}
                            >
                                {phoneLinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                                {phoneLinking ? 'Generando código…' : 'Obtener código'}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-center">
                                <p className="mb-1 text-xs text-muted-foreground">Tu código de vinculación</p>
                                <p className="select-all font-mono text-2xl font-bold tracking-[0.2em]">{phoneCode}</p>
                            </div>
                            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                                <li>Abre <span className="font-semibold">WhatsApp</span> en tu teléfono.</li>
                                <li><span className="font-semibold">Dispositivos vinculados</span> → <span className="font-semibold">Vincular un dispositivo</span>.</li>
                                <li>Toca <span className="font-semibold">Vincular con número de teléfono</span>.</li>
                                <li>Ingresa el código de arriba.</li>
                            </ol>
                            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Esperando la vinculación…
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={closePhoneDialog}>Cerrar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default QRCodeGenerator;
