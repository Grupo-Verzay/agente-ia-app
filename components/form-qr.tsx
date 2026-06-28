'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getInstances, generateQRCode } from '@/actions/api-action';
import { Button } from "@/components/ui/button";
import { QrScanDialog } from "@/components/shared/QrScanDialog";
import { QrCode } from "lucide-react";
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
                qr={qrCode ? <Image src={qrCode} alt="Código QR" width={200} height={200} /> : undefined}
                steps={[
                    <>Abre <span className="font-bold">WhatsApp Business</span> en tu teléfono.</>,
                    <>Toca <span className="font-bold">Dispositivos vinculados</span> &gt; vincular un <span className="font-bold">dispositivo</span>.</>,
                    <>Apunta la <span className="font-bold">cámara</span> para escanear el <span className="font-bold">QR</span>.</>,
                ]}
            />
        </>
    );
};

export default QRCodeGenerator;
