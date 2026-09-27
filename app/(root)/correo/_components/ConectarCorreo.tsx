"use client";

import { useState } from "react";
import { Loader2, Mail, Server } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { conectarImapAction } from "@/actions/correo-actions";
import type { BuzonVisible } from "@/lib/correo-db";
import type { ProveedorConBoton } from "@/lib/correo";

/**
 * Las tres formas de conectar un correo, en UN componente: lo pinta la
 * pantalla vacía y lo pinta el diálogo de «Conectar otro correo». Con dos
 * copias, el día que se afine una la otra se queda atrás.
 *
 * Gmail y Outlook NAVEGAN a `/api/correo/conectar/<proveedor>`, que manda al
 * consentimiento de Google o Microsoft. Sin las llaves configuradas en la
 * plataforma el botón sale apagado **y dice por qué**: un botón que lleva a una
 * pantalla de error de Google no explica nada.
 */
export function ConectarCorreo({
    conBoton,
    alConectar,
}: {
    conBoton: Record<ProveedorConBoton, boolean>;
    alConectar: (buzon: BuzonVisible) => void;
}) {
    const [conImap, setConImap] = useState(false);

    return (
        <div data-conectar-correo className="flex w-full max-w-md flex-col gap-3">
            <BotonDeProveedor proveedor="gmail" nombre="Conectar Gmail" disponible={conBoton.gmail} />
            <BotonDeProveedor proveedor="outlook" nombre="Conectar Outlook" disponible={conBoton.outlook} />
            {conImap ? (
                <FormularioImap alConectar={alConectar} alCancelar={() => setConImap(false)} />
            ) : (
                <Button variant="outline" className="h-10 justify-start gap-2" onClick={() => setConImap(true)}>
                    <Server className="h-4 w-4" />
                    Conectar correo de dominio propio
                </Button>
            )}
            <p className="text-xs text-muted-foreground">
                Solo tú verás este correo. No se mezcla con Chats ni crea leads.
            </p>
        </div>
    );
}

function BotonDeProveedor({
    proveedor,
    nombre,
    disponible,
}: {
    proveedor: ProveedorConBoton;
    nombre: string;
    disponible: boolean;
}) {
    const [yendo, setYendo] = useState(false);
    if (!disponible) {
        return (
            <div className="flex flex-col gap-1">
                <Button variant="outline" className="h-10 justify-start gap-2" disabled>
                    <Mail className="h-4 w-4" />
                    {nombre}
                </Button>
                <span className="text-xs text-muted-foreground">
                    La conexión con {proveedor === "gmail" ? "Google" : "Microsoft"} aún no está configurada en la plataforma.
                </span>
            </div>
        );
    }
    return (
        <Button
            variant="outline"
            className="h-10 justify-start gap-2"
            disabled={yendo}
            onClick={() => {
                // Que se vea que se pulsó: la redirección tarda un momento.
                setYendo(true);
                window.location.href = `/api/correo/conectar/${proveedor}`;
            }}
        >
            {yendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {yendo ? "Abriendo…" : nombre}
        </Button>
    );
}

function FormularioImap({
    alConectar,
    alCancelar,
}: {
    alConectar: (buzon: BuzonVisible) => void;
    alCancelar: () => void;
}) {
    const [datos, setDatos] = useState({
        direccion: "",
        usuario: "",
        contrasena: "",
        imapHost: "",
        imapPuerto: "993",
        smtpHost: "",
        smtpPuerto: "465",
    });
    const [enviando, setEnviando] = useState(false);
    const [motivo, setMotivo] = useState<string | null>(null);
    const campo = (k: keyof typeof datos) => ({
        value: datos[k],
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDatos((d) => ({ ...d, [k]: e.target.value })),
    });

    return (
        <form
            data-formulario-imap
            className="flex flex-col gap-3 rounded-md border border-border p-3"
            onSubmit={async (e) => {
                e.preventDefault();
                setEnviando(true);
                setMotivo(null);
                try {
                    const r = await conectarImapAction(datos);
                    if (!r.success) {
                        setMotivo(r.message);
                        return;
                    }
                    toast.success(`Correo conectado: ${r.buzon.direccion}`);
                    alConectar(r.buzon);
                } catch {
                    setMotivo("No se pudo completar. Revisa la conexión.");
                } finally {
                    setEnviando(false);
                }
            }}
        >
            <div className="grid gap-1.5">
                <Label htmlFor="correo-direccion">Correo</Label>
                <Input id="correo-direccion" type="email" autoComplete="off" placeholder="tu@empresa.com" {...campo("direccion")} />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="correo-usuario">Usuario (si no es el correo)</Label>
                <Input id="correo-usuario" autoComplete="off" {...campo("usuario")} />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="correo-contrasena">Contraseña</Label>
                <Input id="correo-contrasena" type="password" autoComplete="new-password" {...campo("contrasena")} />
            </div>
            <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                <div className="grid min-w-0 gap-1.5">
                    <Label htmlFor="correo-imap">Servidor de entrada (IMAP)</Label>
                    <Input id="correo-imap" placeholder="mail.empresa.com" {...campo("imapHost")} />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="correo-imap-puerto">Puerto</Label>
                    <Input id="correo-imap-puerto" inputMode="numeric" {...campo("imapPuerto")} />
                </div>
            </div>
            <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                <div className="grid min-w-0 gap-1.5">
                    <Label htmlFor="correo-smtp">Servidor de salida (SMTP)</Label>
                    <Input id="correo-smtp" placeholder="Igual que el de entrada" {...campo("smtpHost")} />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="correo-smtp-puerto">Puerto</Label>
                    <Input id="correo-smtp-puerto" inputMode="numeric" {...campo("smtpPuerto")} />
                </div>
            </div>
            {motivo ? <p data-motivo className="text-sm text-destructive">{motivo}</p> : null}
            <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="ghost" onClick={alCancelar} disabled={enviando}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={enviando}>
                    {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {enviando ? "Probando…" : "Conectar"}
                </Button>
            </div>
        </form>
    );
}
