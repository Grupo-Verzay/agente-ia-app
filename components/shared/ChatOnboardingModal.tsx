"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/ai-chat/useChatStore";
import { HelpCircle, MessageCircle, Search, ArrowRight } from "lucide-react";

const ONBOARDING_KEY = "chat-onboarding-shown";

export function ChatOnboardingModal() {
    const initOnboarding = useChatStore((s) => s.initOnboarding);
    const setChatOpen = useChatStore((s) => s.setOpen);

    const [open, setOpen] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        initOnboarding();

        const alreadyShown = localStorage.getItem(ONBOARDING_KEY);

        if (!alreadyShown) {
            setOpen(true);
        }

        setReady(true);
    }, [initOnboarding]);

    const close = () => {
        localStorage.setItem(ONBOARDING_KEY, "true");
        setOpen(false);
    };

    const go = () => {
        localStorage.setItem(ONBOARDING_KEY, "true");
        setOpen(false);
        setChatOpen(true);
    };

    if (!ready) return null;

    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                if (!value) {
                    localStorage.setItem(ONBOARDING_KEY, "true");
                }
                setOpen(value);
            }}
        >
            <DialogContent className="border-border sm:max-w-[760px]">
                <DialogHeader className="space-y-1">
                    <DialogTitle className="text-xl">Guía rápida</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        Si tienes dudas sobre cómo hacer algo en la app, usa el chat y te guío paso a paso.
                    </p>
                </DialogHeader>

                <div className="grid gap-3 sm:grid-cols-3">
                    <TipCard
                        icon={<HelpCircle className="h-5 w-5" />}
                        iconClass="text-primary ring-primary/20"
                        title="Pregúntame lo que necesitas"
                        text="Ejemplos: “¿Cómo cambio el nombre de un lead?” o “¿Dónde veo los chats?”"
                    />

                    <TipCard
                        icon={<Search className="h-5 w-5" />}
                        iconClass="text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                        title="Te digo dónde está"
                        text="Te indicaré la ruta exacta y los pasos para llegar al lugar correcto."
                    />

                    <TipCard
                        icon={<MessageCircle className="h-5 w-5" />}
                        iconClass="text-amber-600 ring-amber-500/20 dark:text-amber-400"
                        title="Respuestas claras"
                        text="Si falta un dato, te haré una sola pregunta para ayudarte más rápido."
                    />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ArrowRight className="h-4 w-4" />
                        <span>Tip: puedes escribir “¿dónde está…?” y te doy la ruta exacta.</span>
                    </div>

                    <Button onClick={go} className="sm:w-auto w-full">
                        Chatea conmigo!
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function TipCard({
    icon,
    title,
    text,
    iconClass = "text-muted-foreground",
}: {
    icon: React.ReactNode;
    title: string;
    text: string;
    iconClass?: string;
}) {
    return (
        <div className="rounded-xl border border-border p-4">
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center ${iconClass}`}>
                    {icon}
                </div>
                <div className="space-y-1">
                    <div className="font-medium">{title}</div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
                </div>
            </div>
        </div>
    );
}