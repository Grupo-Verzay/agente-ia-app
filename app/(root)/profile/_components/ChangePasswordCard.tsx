'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { selfChangePassword } from "@/actions/auth-action";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

export const ChangePasswordCard = () => {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [show, setShow] = useState({ old: false, new: false, confirm: false });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("Las contraseñas no coinciden");
            return;
        }
        if (newPassword.length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres");
            return;
        }
        setLoading(true);
        const toastId = "change-password";
        toast.loading("Actualizando contraseña...", { id: toastId });
        try {
            const res = await selfChangePassword({ oldPassword, newPassword });
            if (res.success) {
                toast.success(res.message, { id: toastId });
                setOldPassword("");
                setNewPassword("");
                setConfirmPassword("");
            } else {
                toast.error(res.message, { id: toastId });
            }
        } catch {
            toast.error("Error al cambiar la contraseña", { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    const PasswordInput = ({
        id,
        label,
        value,
        onChange,
        showKey,
        autoComplete,
    }: {
        id: string;
        label: string;
        value: string;
        onChange: (v: string) => void;
        showKey: keyof typeof show;
        autoComplete: string;
    }) => (
        <div className="space-y-1.5">
            <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
            <div className="relative">
                <Input
                    id={id}
                    type={show[showKey] ? "text" : "password"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={loading}
                    autoComplete={autoComplete}
                    className="pr-10"
                />
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShow(prev => ({ ...prev, [showKey]: !prev[showKey] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                    {show[showKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );

    return (
        <Card className="border-border">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-sm font-semibold">Seguridad</CardTitle>
                        <CardDescription className="text-xs">Actualiza tu contraseña de acceso</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <PasswordInput
                        id="oldPassword"
                        label="Contraseña actual"
                        value={oldPassword}
                        onChange={setOldPassword}
                        showKey="old"
                        autoComplete="current-password"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <PasswordInput
                            id="newPassword"
                            label="Nueva contraseña"
                            value={newPassword}
                            onChange={setNewPassword}
                            showKey="new"
                            autoComplete="new-password"
                        />
                        <PasswordInput
                            id="confirmPassword"
                            label="Confirmar contraseña"
                            value={confirmPassword}
                            onChange={setConfirmPassword}
                            showKey="confirm"
                            autoComplete="new-password"
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Actualizando...
                            </>
                        ) : (
                            "Actualizar contraseña"
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};
