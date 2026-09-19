"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, LifeBuoy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryCodeSelect } from "@/components/custom/CountryCodeSelect";
import { CamposDelTicket } from "@/components/tickets/CamposDelTicket";
import type { AdjuntoEnElAire } from "@/app/(root)/proyectos/_components/BloqueDeAdjuntos";
import {
    enviarTicketPublicoAction,
    type FichaPublica,
} from "@/actions/tickets-publico-actions";
import { armarElNumero } from "@/lib/telefono-de-pais";
import { queLeFaltaALaFichaPublica, TOPE_DEL_NOMBRE } from "@/lib/tickets";

/**
 * La ficha de soporte que abre un cliente final por el enlace de una cuenta.
 *
 * # Lo que se recuerda vive SOLO en este navegador
 *
 * El nombre y el teléfono se guardan en `localStorage` para no teclearlos en
 * cada envío, y **siempre se pueden cambiar**. Lo que no se hace nunca es
 * traerlos del servidor buscando por número: el enlace es público, así que eso
 * convertiría la ficha en una forma de preguntar «¿de quién es este número?»
 * sobre los contactos de la cuenta. Es el mismo reparto que ya rige en el chat
 * del equipo — lo que decide el navegador es comodidad, lo que decide el
 * servidor es el dato.
 *
 * Y todo va en `try/catch`: en una ventana privada leer `localStorage` puede
 * lanzar, y sin eso la ficha entera se cae justo en los navegadores donde más
 * se mira la privacidad.
 *
 * # El número final se VE antes de enviar
 *
 * `armarElNumero` recorta el indicativo repetido y corrige el área —el caso de
 * República Dominicana, con 809, 829 y 849 sobre el mismo +1— pero una regla
 * que se equivoca en silencio es la familia del «999999999 de -1 créditos».
 * Así que debajo del campo se enseña el número tal y como se va a guardar, que
 * es lo único que de verdad protege.
 */

const LLAVE = "verzay:ficha-de-soporte";

function loRecordado(): { nombre: string; telefono: string; indicativo: string } | null {
    try {
        const crudo = window.localStorage.getItem(LLAVE);
        if (!crudo) return null;
        const dato = JSON.parse(crudo);
        return {
            nombre: String(dato?.nombre ?? ""),
            telefono: String(dato?.telefono ?? ""),
            indicativo: String(dato?.indicativo ?? ""),
        };
    } catch {
        return null;
    }
}

export function FichaPublicaDeTicket({
    codigo,
    ficha,
}: {
    codigo: string;
    ficha: FichaPublica;
}) {
    const [nombre, setNombre] = useState("");
    const [indicativo, setIndicativo] = useState(ficha.indicativoPorDefecto);
    const [telefono, setTelefono] = useState("");
    const [titulo, setTitulo] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [enElAire, setEnElAire] = useState<AdjuntoEnElAire[]>([]);
    const [enviando, setEnviando] = useState(false);
    const [enviado, setEnviado] = useState(false);

    // Se lee en un efecto y no en el estado inicial: `localStorage` no existe
    // en el servidor, y leerlo al montar es lo que evita que el HTML pintado
    // allí y el del navegador salgan distintos.
    useEffect(() => {
        const recordado = loRecordado();
        if (!recordado) return;
        setNombre(recordado.nombre);
        setTelefono(recordado.telefono);
        if (recordado.indicativo) setIndicativo(recordado.indicativo);
    }, []);

    const indicativos = useMemo(
        () => ficha.paises.flatMap((p) => p.codes),
        [ficha.paises],
    );

    const numero = useMemo(
        () => armarElNumero({ indicativo, escrito: telefono, indicativos }),
        [indicativo, telefono, indicativos],
    );

    /** La subida va por la ruta pública: aquí no hay sesión que valga. */
    const subir = useRef(async (archivo: File): Promise<string> => {
        const formData = new FormData();
        formData.append("file", archivo);
        formData.append("codigo", codigo);
        const respuesta = await fetch("/api/tickets-publico/archivo", {
            method: "POST",
            body: formData,
        });
        const datos = await respuesta.json().catch(() => null);
        if (!respuesta.ok || !datos?.url) {
            throw new Error(datos?.error || "No se pudo subir el archivo.");
        }
        return datos.url as string;
    }).current;

    const borrar = useRef(async (url: string): Promise<void> => {
        try {
            await fetch("/api/tickets-publico/archivo", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ codigo, url }),
            });
        } catch (error) {
            // Best-effort: quitar un archivo de la lista tiene que funcionar
            // aunque el borrado del bucket falle. Pero no es mudo.
            console.warn("[tickets] no se pudo borrar un archivo sin usar", {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }).current;

    const enviar = async () => {
        if (numero.problema) {
            toast.error(numero.problema);
            return;
        }
        const falta = queLeFaltaALaFichaPublica({
            nombre,
            telefono: numero.e164,
            titulo,
            descripcion,
        });
        if (falta) {
            toast.error(falta);
            return;
        }

        setEnviando(true);
        try {
            const res = await enviarTicketPublicoAction({
                codigo,
                nombre: nombre.trim(),
                indicativo,
                telefono,
                titulo: titulo.trim(),
                descripcion: descripcion.trim(),
                adjuntos: enElAire.map((a) => ({
                    url: a.url,
                    nombre: a.nombre,
                    tipo: a.tipo,
                    mimeType: a.mimeType,
                    tamanoBytes: a.tamanoBytes,
                })),
            });
            if (!res.success) {
                toast.error(res.message);
                return;
            }

            // Se recuerda lo que costó teclear, y nada más: ni el título ni el
            // texto, que son de ESTE envío. Cada envío es un ticket nuevo e
            // independiente.
            try {
                window.localStorage.setItem(
                    LLAVE,
                    JSON.stringify({ nombre: nombre.trim(), telefono, indicativo: numero.indicativo }),
                );
            } catch {
                /* Ventana privada: se sigue igual, solo que sin recordar. */
            }

            // Los archivos se vacían ANTES de nada: ya cuelgan del ticket, y
            // volver a tocarlos los borraría del bucket.
            setEnElAire([]);
            setTitulo("");
            setDescripcion("");
            setEnviado(true);
        } catch (error) {
            // Una acción no solo devuelve `success: false`: puede reventar, y
            // sin esto el botón se queda en «Enviando…» para siempre.
            console.warn("[tickets] no se pudo enviar la ficha pública", error);
            toast.error("No se pudo enviar tu solicitud. Inténtalo de nuevo.");
        } finally {
            setEnviando(false);
        }
    };

    if (enviado) {
        return (
            <Cabecera ficha={ficha}>
                <div className="space-y-4 py-6 text-center">
                    <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                    <div className="space-y-1">
                        <p className="text-base font-semibold">Recibimos tu solicitud</p>
                        <p className="text-sm text-muted-foreground">
                            Te escribimos por WhatsApp al{" "}
                            <span className="font-medium text-foreground">{numero.comoSeVe}</span>{" "}
                            cuando esté resuelta.
                        </p>
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => setEnviado(false)}>
                        Enviar otra solicitud
                    </Button>
                </div>
            </Cabecera>
        );
    }

    return (
        <Cabecera ficha={ficha}>
            <div className="space-y-4">
                {/* Nombre y teléfono van ARRIBA: son de quién es la solicitud, y
                    debajo del texto se rellenan sin mirar. */}
                <div className="space-y-1.5">
                    <Label htmlFor="ficha-nombre">Tu nombre</Label>
                    <Input
                        id="ficha-nombre"
                        value={nombre}
                        maxLength={TOPE_DEL_NOMBRE}
                        disabled={enviando}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej.: María Gómez"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="ficha-telefono">Tu WhatsApp</Label>
                    {/* En un móvil el selector de país y el campo no caben en una
                        fila: el selector pide unos 200 px para el nombre del país
                        y al número le quedarían cuatro dígitos. Se apilan hasta
                        `sm` y se ponen en fila a partir de ahí. */}
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="sm:w-[15rem] sm:shrink-0">
                            <CountryCodeSelect
                                countries={ficha.paises}
                                value={indicativo}
                                onChange={(code) => setIndicativo(code || ficha.indicativoPorDefecto)}
                                disabled={enviando}
                            />
                        </div>
                        <Input
                            id="ficha-telefono"
                            className="min-w-0 flex-1"
                            value={telefono}
                            inputMode="tel"
                            maxLength={40}
                            disabled={enviando}
                            onChange={(e) => setTelefono(e.target.value)}
                            placeholder="300 123 4567"
                        />
                    </div>
                    {/* **El número final, a la vista antes de enviar.** Es lo
                        único que protege de un recorte que se equivoque en
                        silencio: aquí se ve lo que se va a guardar. */}
                    {telefono.trim() ? (
                        numero.problema ? (
                            <p className="text-xs text-destructive">{numero.problema}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Te escribiremos al{" "}
                                <span className="font-medium text-foreground">{numero.comoSeVe}</span>
                                {numero.recortado ? " (quitamos el indicativo repetido)" : ""}
                            </p>
                        )
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Solo te escribimos cuando tu solicitud quede resuelta.
                        </p>
                    )}
                </div>

                <CamposDelTicket
                    titulo={titulo}
                    onTitulo={setTitulo}
                    descripcion={descripcion}
                    onDescripcion={setDescripcion}
                    userId=""
                    enElAire={enElAire}
                    onEnElAire={setEnElAire}
                    subir={subir}
                    borrar={borrar}
                    deshabilitado={enviando}
                />

                <Button className="w-full" onClick={() => void enviar()} disabled={enviando}>
                    {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {enviando ? "Enviando…" : "Enviar solicitud"}
                </Button>
            </div>
        </Cabecera>
    );
}

/** El nombre o el logo de la cuenta arriba: es lo que el cliente reconoce. */
function Cabecera({
    ficha,
    children,
}: {
    ficha: FichaPublica;
    children: React.ReactNode;
}) {
    return (
        <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-6 sm:py-10">
            <div className="flex items-center gap-3">
                {ficha.cuentaLogo ? (
                    <Image
                        src={ficha.cuentaLogo}
                        alt={ficha.cuentaNombre}
                        width={44}
                        height={44}
                        className="h-11 w-11 shrink-0 rounded-lg object-cover"
                        unoptimized
                    />
                ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <LifeBuoy className="h-6 w-6 text-primary" />
                    </span>
                )}
                <div className="min-w-0">
                    <p className="truncate text-base font-semibold leading-tight">
                        {ficha.cuentaNombre}
                    </p>
                    <p className="text-xs text-muted-foreground">Soporte</p>
                </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">{children}</div>
        </div>
    );
}
