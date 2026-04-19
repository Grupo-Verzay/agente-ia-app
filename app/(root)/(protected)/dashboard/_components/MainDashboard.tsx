'use client'

import FormInstance from '@/components/form-Instance'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import QRCodeGenerator from "@/components/form-qr";
import EnableToggleButton from "@/components/button-bot";
import { FaWhatsapp } from 'react-icons/fa';
import { User } from '@prisma/client';
import { useEffect } from 'react';
import { toast } from 'sonner';

interface propsMainDashboard {
    user: User
}

export const MainDashboard = ({ user }: propsMainDashboard) => {
    useEffect(() => {
        if (!user.webhookUrl) {
            toast.error('¡Alerta! Webhook no proporcionado');
        }
    }, [user]);

    return (
        <div className="flex flex-col items-center min-h-screen">
            <Card className="max-w-[600px] relative border-border">
                <CardContent className="flex flex-col">
                    {/* Contenedor para el formulario */}
                    <FormInstance userId={user.id} />

                    {/* Contenedor horizontal para QR y botón de toggle */}
                    <div className="flex flex-row  justify-between items-center gap-2">

                        <a
                            href="https://wa.me/1234567890"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-green-500 hover:bg-green-600 text-white p-2 rounded-full shadow-lg transition"
                        >
                            <FaWhatsapp size={24} />
                        </a>

                        {/* QR Generator */}
                        <div className="flex-1">
                            <QRCodeGenerator userId={user.id} />
                        </div>

                        {/* Enable Toggle Button */}
                        <div className="flex-1 flex justify-end">
                            <EnableToggleButton
                                userId={user.id}
                                userName={user.name}
                                apiurl={user.apiUrl}
                                apikey={user.apiKeyId as string}
                                webhookUrl={user?.webhookUrl ?? 'https://backend.ia-app.com/webhook'}
                            />
                        </div>

                    </div>
                </CardContent>
                <CardFooter>
                    <p className="pr-1 font-bold ">
                        Whatsapp |
                    </p>
                    <p className="pr-1 text-gray-400">Business</p>
                </CardFooter>
            </Card>
        </div>
    )
}