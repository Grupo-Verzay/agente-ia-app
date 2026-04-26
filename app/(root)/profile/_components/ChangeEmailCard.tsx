'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { selfChangeEmail } from "@/actions/auth-action";
import { Loader2, Mail } from "lucide-react";

export const ChangeEmailCard = ({ currentEmail }: { currentEmail: string }) => {
    const [newEmail, setNewEmail] = useState("");
    const [confirmEmail, setConfirmEmail] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newEmail !== confirmEmail) {
            toast.error("Los correos no coinciden");
            return;
        }
        setLoading(true);
        const toastId = "change-email";
        toast.loading("Actualizando correo...", { id: toastId });
        try {
            const res = await selfChangeEmail({ newEmail });
            if (res.success) {
                toast.success(res.message, { id: toastId });
                setNewEmail("");
                setConfirmEmail("");
            } else {
                toast.error(res.message, { id: toastId });
            }
        } catch {
            toast.error("Error al cambiar el correo", { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="border-border">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-sm font-semibold">Cambio de correo</CardTitle>
                        <CardDescription className="text-xs">Actualiza tu dirección de correo electrónico</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Correo actual</Label>
                        <Input
                            value={currentEmail}
                            disabled
                            className="bg-muted text-muted-foreground"
                        />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="newEmail" className="text-sm font-medium">Nuevo correo</Label>
                            <Input
                                id="newEmail"
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                disabled={loading}
                                autoComplete="email"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirmEmail" className="text-sm font-medium">Confirmar correo</Label>
                            <Input
                                id="confirmEmail"
                                type="email"
                                value={confirmEmail}
                                onChange={(e) => setConfirmEmail(e.target.value)}
                                disabled={loading}
                                autoComplete="email"
                            />
                        </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Actualizando...
                            </>
                        ) : (
                            "Actualizar correo"
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};
