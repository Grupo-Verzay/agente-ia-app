// Selector del Agente IA: elige qué agente configurar — el de CHAT (WhatsApp,
// multicanal) o el de LLAMADAS (voz). Cada tarjeta lleva a su propio editor de
// prompt, separados y claros (mismo patrón/ancho que Mis Datos / Landing / Planes).
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, Phone, ArrowLeft } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

const AgenteSelectorPage = async () => {
    const user = await currentUser();
    if (!user) redirect('/login');

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-muted/60 border-b border-border/40 px-4 pt-4 pb-3 shrink-0 flex items-center justify-between gap-4">
                <h2 className="h3-bold text-gray-900 dark:text-white">Agente IA</h2>
            </div>

            {/* Contenido */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
                <div className="flex flex-col justify-center min-h-[60vh]">
                    <div className="w-full space-y-5">
                        <div className="text-center space-y-1 mb-2">
                            <h3 className="text-lg font-semibold">¿Qué agente deseas configurar?</h3>
                            <p className="text-sm text-muted-foreground">
                                Cada agente tiene su propio prompt, separado y claro.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Agente de Chat (WhatsApp) */}
                            <Link href="/ia/chat" className="block">
                                <Card className="cursor-pointer group hover:border-green-500/50 hover:shadow-lg transition-all duration-200 border-l-4 border-l-green-500/40 h-full">
                                    <CardContent className="p-8 flex flex-col gap-5 h-full">
                                        <div className="flex items-center gap-4">
                                            <div className="h-14 w-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0 group-hover:bg-green-500/20 transition-colors">
                                                <MessageSquare className="h-7 w-7 text-green-600 dark:text-green-400" />
                                            </div>
                                            <h4 className="font-semibold text-lg leading-snug">Agente de Chat (WhatsApp)</h4>
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <p className="text-sm text-muted-foreground">
                                                El agente que responde por texto en WhatsApp y demás canales.
                                            </p>
                                            <ul className="space-y-2 pt-2">
                                                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                                                    <span className="text-green-500 font-bold mt-0.5 shrink-0">✓</span>
                                                    Perfil del negocio, preguntas, productos y reglas
                                                </li>
                                                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                                                    <span className="text-green-500 font-bold mt-0.5 shrink-0">✓</span>
                                                    Editor completo por pestañas con vista previa
                                                </li>
                                                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                                                    <span className="text-green-500 font-bold mt-0.5 shrink-0">✓</span>
                                                    Optimizado para conversaciones escritas
                                                </li>
                                            </ul>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 pt-6 border-t border-border/50">
                                            <p className="text-xs text-muted-foreground truncate">El agente que ya usas en tus chats</p>
                                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400 shrink-0 group-hover:gap-3 transition-all whitespace-nowrap">
                                                <ArrowLeft className="h-4 w-4 rotate-180" />
                                                Configurar
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>

                            {/* Agente de Llamadas (Voz) */}
                            <Link href="/ia/llamadas" className="block">
                                <Card className="cursor-pointer group hover:border-violet-500/50 hover:shadow-lg transition-all duration-200 border-l-4 border-l-violet-500/40 h-full">
                                    <CardContent className="p-8 flex flex-col gap-5 h-full">
                                        <div className="flex items-center gap-4">
                                            <div className="h-14 w-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 transition-colors">
                                                <Phone className="h-7 w-7 text-violet-600 dark:text-violet-400" />
                                            </div>
                                            <h4 className="font-semibold text-lg leading-snug">Agente de Llamadas (Voz)</h4>
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <p className="text-sm text-muted-foreground">
                                                El asistente que llama y conversa por teléfono con tus clientes.
                                            </p>
                                            <ul className="space-y-2 pt-2">
                                                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                                                    <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                                                    Prompt propio, claro y corto para hablar
                                                </li>
                                                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                                                    <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                                                    Sin confundirse con las reglas del chat
                                                </li>
                                                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                                                    <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                                                    Agenda citas y envía info por WhatsApp en la llamada
                                                </li>
                                            </ul>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 pt-6 border-t border-border/50">
                                            <p className="text-xs text-muted-foreground truncate">Exclusivo para las llamadas con IA</p>
                                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 shrink-0 group-hover:gap-3 transition-all whitespace-nowrap">
                                                <ArrowLeft className="h-4 w-4 rotate-180" />
                                                Configurar
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgenteSelectorPage;
