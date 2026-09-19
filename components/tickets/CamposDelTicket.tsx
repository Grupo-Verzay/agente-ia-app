"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    BloqueDeAdjuntos,
    type AdjuntoEnElAire,
} from "@/app/(root)/proyectos/_components/BloqueDeAdjuntos";
import { TOPE_DEL_TITULO, TOPE_DE_LA_DESCRIPCION } from "@/lib/tickets";

/**
 * Los campos que hacen que un ticket sea un ticket: **título, texto y
 * archivos**.
 *
 * Existe porque hay **dos fichas** que los piden —la del cliente con cuenta,
 * dentro de un diálogo, y la pública que se abre por el enlace— y con dos
 * copias el día que se afine algo se afina en una y la otra se queda atrás. Eso
 * no se ve como un error: se ve como que la ficha pública «tiene menos cosas».
 *
 * Lo que cada ficha pone **alrededor** sí es suyo: la privada añade a nombre de
 * qué cuenta, el responsable y su WhatsApp; la pública añade arriba el nombre y
 * el teléfono, y no enseña ni prioridad, ni estado, ni responsable, ni
 * etiquetas — el ticket entra normal y sin asignar para que lo reparta el dueño.
 */
export function CamposDelTicket({
    titulo,
    onTitulo,
    descripcion,
    onDescripcion,
    userId,
    enElAire,
    onEnElAire,
    carpeta = "tickets",
    subir,
    borrar,
    deshabilitado,
}: {
    titulo: string;
    onTitulo: (v: string) => void;
    descripcion: string;
    onDescripcion: (v: string) => void;
    /** De quién es la carpeta del bucket. En la ficha pública, la cuenta. */
    userId: string;
    enElAire: AdjuntoEnElAire[];
    onEnElAire: (v: AdjuntoEnElAire[]) => void;
    carpeta?: string;
    /** La ficha pública sube por su propia ruta: ahí no hay sesión. */
    subir?: (archivo: File) => Promise<string>;
    borrar?: (url: string) => Promise<void>;
    deshabilitado?: boolean;
}) {
    return (
        <>
            <div className="space-y-1.5">
                <Label htmlFor="ticket-titulo">Título</Label>
                <Input
                    id="ticket-titulo"
                    value={titulo}
                    maxLength={TOPE_DEL_TITULO}
                    disabled={deshabilitado}
                    onChange={(e) => onTitulo(e.target.value)}
                    placeholder="Ej.: No me carga el código QR"
                />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="ticket-descripcion">¿Qué está pasando?</Label>
                <Textarea
                    id="ticket-descripcion"
                    value={descripcion}
                    maxLength={TOPE_DE_LA_DESCRIPCION}
                    disabled={deshabilitado}
                    onChange={(e) => onDescripcion(e.target.value)}
                    rows={5}
                    placeholder="Cuéntanos con detalle: qué hiciste, qué esperabas y qué salió."
                />
            </div>

            {/* `taskId={null}`: el ticket todavía no existe, así que los
                archivos suben «en el aire» —al bucket, sin colgar de nada— y se
                enganchan al guardar. Es el mismo camino que ya existía para una
                tarea sin crear, y de ahí vienen gratis el pegado con Ctrl+V, el
                arrastrar y el tope. */}
            <BloqueDeAdjuntos
                taskId={null}
                userId={userId}
                adjuntos={[]}
                onCambio={() => {
                    /* Sin ticket todavía no hay nada guardado: todo cae en el aire. */
                }}
                enElAire={enElAire}
                onCambioEnElAire={onEnElAire}
                carpeta={carpeta}
                queEs="ticket"
                subir={subir}
                borrar={borrar}
            />
        </>
    );
}
