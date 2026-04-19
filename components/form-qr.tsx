'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getInstances, generateQRCode } from '@/actions/api-action';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, QrCode, CheckCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from 'next/navigation';
import { Skeleton } from './ui/skeleton';
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

    useEffect(() => {
        let mounted = true;

        const loadInstances = async () => {
            try {
                const instances = await getInstances(userId);
                if (!mounted) return;

                if (!Array.isArray(instances) || instances.length === 0) {
                    setError('No se encontraron instancias para este usuario.');
                    return;
                }

                const whatsappIndex = instances.findIndex(i => i.instanceType === 'Whatsapp');
                if (whatsappIndex === -1) {
                    setError('No se encontró una instancia tipo Whatsapp para este usuario.');
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

    const handleBackdropClick = (event: React.MouseEvent) => {
        if (event.currentTarget === event.target) {
            setIsModalOpen(false);
        }
    };

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
                    variant={isApiDisconnected ? "destructive" : isWhatsappConnected ? "default" : "secondary"}
                >
                    <QrCode className="mr-2 h-4 w-4" />
                    {isApiDisconnected ? "API desconectada" : isWhatsappConnected ? "Conectado" : "Conectar"}
                </Button>
            )}

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent onClick={handleBackdropClick} className="border-border">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <QrCode className="w-5 h-5" />
                            {isApiDisconnected
                                ? "API de Evolution desconectada"
                                : isWhatsappConnected
                                    ? "¡Conexión exitosa!"
                                    : "Escanea el código QR"}
                        </DialogTitle>
                        <DialogDescription>
                            {isApiDisconnected
                                ? "Revisa tu configuración (token, instancia, credenciales) para restablecer la conexión."
                                : isWhatsappConnected
                                    ? "Ya puedes usar la integración con WhatsApp."
                                    : "Sigue las instrucciones antes de escanear el código QR."}
                        </DialogDescription>
                    </DialogHeader>

                    {loading && (
                        <div className="flex items-center justify-center">
                            <Loader2 className="animate-spin w-6 h-6" />
                        </div>
                    )}

                    {error && !loading && (
                        <p className="text-sm text-red-500">{error}</p>
                    )}

                    {!error && !loading && (
                        <>
                            {isWhatsappConnected ? (
                                <div className="flex flex-col items-center gap-2">
                                    <CheckCircle className="w-10 h-10 text-green-500" />
                                    <p className="text-green-600 font-medium">WhatsApp conectado correctamente</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    {qrCode && (
                                        <Image
                                            src={qrCode}
                                            alt="Código QR"
                                            width={224}
                                            height={224}
                                            className="mx-auto rounded-lg border"
                                        />
                                    )}
                                    <div className="mt-4 text-left space-y-2 text-sm max-w-sm">
                                        <h3 className="font-semibold text-base">🤚 Lee antes de escanear:</h3>
                                        <ul className="list-decimal list-inside space-y-1">
                                            <li>Abre <span className="font-bold">WhatsApp Business</span> en tu teléfono.</li>
                                            <li>Toca <span className="font-bold">Dispositivos vinculados</span> &gt; vincular un <span className="font-bold">dispositivo</span>.</li>
                                            <li>Apunta la <span className="font-bold">cámara</span> para escanear el <span className="font-bold">QR</span>.</li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};

export default QRCodeGenerator;
