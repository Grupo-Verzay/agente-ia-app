"use client";

import { useMemo, useState, useTransition } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldCheck, ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { adminChangeUserPassword } from "@/actions/auth-action";
import { useRouter } from "next/navigation";

type Props = { userId: string };

const passwordSchema = z
    .object({
        oldPassword: z.string().min(1, "La contraseña actual es obligatoria"),
        newPassword: z
            .string()
            .min(10, "Mínimo 10 caracteres")
            .max(72, "Máximo 72 caracteres")
            .regex(/[A-Z]/, "Debe incluir una MAYÚSCULA")
            .regex(/[a-z]/, "Debe incluir una minúscula")
            .regex(/[0-9]/, "Debe incluir un número")
            .regex(/[^A-Za-z0-9]/, "Debe incluir un símbolo"),
        confirmPassword: z.string().min(1, "Confirma la nueva contraseña"),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
        path: ["confirmPassword"],
        message: "Las contraseñas no coinciden",
    })
    .refine((v) => v.oldPassword !== v.newPassword, {
        path: ["newPassword"],
        message: "La nueva contraseña no puede ser igual a la actual",
    });

type LogLine = { ts: string; level: "info" | "warn" | "error"; msg: string };

const reqs = [
    { key: "len", label: "Mínimo 10 caracteres", test: (p: string) => p.length >= 10 },
    { key: "upper", label: "Una MAYÚSCULA", test: (p: string) => /[A-Z]/.test(p) },
    { key: "lower", label: "Una minúscula", test: (p: string) => /[a-z]/.test(p) },
    { key: "num", label: "Un número", test: (p: string) => /[0-9]/.test(p) },
    { key: "sym", label: "Un símbolo", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function RequirementItem({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            {ok ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <ShieldAlert className="h-4 w-4 text-muted-foreground" />}
            <span className={ok ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}>{label}</span>
        </div>
    );
}

export function ChangeUserPasswordForm({ userId }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [logs, setLogs] = useState<LogLine[]>([]);
    const [fieldError, setFieldError] = useState<Record<string, string>>({});

    const addLog = (level: LogLine["level"], msg: string) => {
        const line = { ts: new Date().toISOString(), level, msg };
        setLogs((p) => [line, ...p].slice(0, 120));
        if (level === "error") console.error("[ChangePassword]", msg);
        else if (level === "warn") console.warn("[ChangePassword]", msg);
        else console.log("[ChangePassword]", msg);
    };

    const checklist = useMemo(() => reqs.map((r) => ({ ...r, ok: r.test(newPassword) })), [newPassword]);

    const matchOk = useMemo(
        () => confirmPassword.length > 0 && newPassword === confirmPassword,
        [newPassword, confirmPassword]
    );

    const validateLocal = () => {
        setFieldError({});
        const parsed = passwordSchema.safeParse({ oldPassword, newPassword, confirmPassword });
        if (!parsed.success) {
            const next: Record<string, string> = {};
            for (const i of parsed.error.issues) {
                const k = i.path?.[0] ? String(i.path[0]) : "form";
                if (!next[k]) next[k] = i.message;
            }
            setFieldError(next);
            return false;
        }
        return true;
    };

    const onSubmit = () => {
        addLog("info", "Validando formulario…");
        if (!validateLocal()) {
            addLog("warn", "Validación local falló. Revisa los campos.");
            toast.error("Revisa los campos");
            return;
        }

        toast.loading("Actualizando contraseña…", { id: "chg-pass" });

        startTransition(async () => {
            try {
                addLog("info", `Enviando a server action (userId=${userId})…`);
                const res = await adminChangeUserPassword({ userId, oldPassword, newPassword });

                addLog("info", `Respuesta: ${JSON.stringify(res)}`);

                if (!res.success) {
                    toast.error(res.message ?? "No se pudo actualizar", { id: "chg-pass" });
                    return;
                }

                toast.success(res.message ?? "Listo", { id: "chg-pass" });

                setOldPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setFieldError({});
                addLog("info", "Campos limpiados. Proceso terminado.");
            } catch (e: any) {
                const msg = e?.message ?? String(e);
                addLog("error", msg);
                toast.error(msg, { id: "chg-pass" });
            } finally {
                router.refresh();
            }
        });
    };

    const allReqsOk = checklist.every((c) => c.ok);

    return (
        <div className="flex w-full justify-center">
            <Card className="flex items-center justify-center border-border pt-4 max-h-[600px]">
                <CardContent>
                    <div className="space-y-2">
                        <div className="space-y-2">
                            <Label htmlFor="oldPassword">Contraseña actual</Label>
                            <div className="relative">
                                <Input
                                    id="oldPassword"
                                    type={showOld ? "text" : "password"}
                                    value={oldPassword}
                                    onChange={(e) => setOldPassword(e.target.value)}
                                    onBlur={validateLocal}
                                    disabled={pending}
                                    placeholder="contraseña actual"
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowOld((v) => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted/40"
                                    aria-label="Mostrar/ocultar"
                                >
                                    {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {fieldError.oldPassword && <p className="text-xs text-destructive">{fieldError.oldPassword}</p>}
                        </div>

                        <Separator />

                        <div className="space-y-2">
                            <Label htmlFor="newPassword">Nueva contraseña</Label>
                            <div className="relative">
                                <Input
                                    id="newPassword"
                                    type={showNew ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    onBlur={validateLocal}
                                    disabled={pending}
                                    placeholder="contraseña fuerte"
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew((v) => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted/40"
                                    aria-label="Mostrar/ocultar"
                                >
                                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {fieldError.newPassword && <p className="text-xs text-destructive">{fieldError.newPassword}</p>}

                            {/* Checklist */}
                            <div className="rounded-lg border border-border p-3">
                                <div className="mb-2 text-xs font-medium">Requisitos</div>
                                <div className="flex gap-1 flex-col">
                                    {checklist.map((c) => (
                                        <RequirementItem key={c.key} ok={c.ok} label={c.label} />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    type={showConfirm ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    onBlur={validateLocal}
                                    disabled={pending}
                                    placeholder="nueva contraseña"
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm((v) => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted/40"
                                    aria-label="Mostrar/ocultar"
                                >
                                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>

                            <div className="text-xs">
                                {confirmPassword.length === 0 ? (
                                    <span className="text-muted-foreground">Escribe la confirmación.</span>
                                ) : matchOk ? (
                                    <span className="text-green-700 dark:text-green-400">Coinciden</span>
                                ) : (
                                    <span className="text-destructive">No coinciden</span>
                                )}
                            </div>

                            {fieldError.confirmPassword && <p className="text-xs text-destructive">{fieldError.confirmPassword}</p>}
                        </div>

                        <Button
                            className="w-full"
                            disabled={pending || !allReqsOk || !matchOk || oldPassword.trim().length === 0}
                            onClick={onSubmit}
                        >
                            {pending ? "Actualizando..." : "Cambiar contraseña"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}