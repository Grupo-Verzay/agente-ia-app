"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";

import {
    losDocumentosQueNombranAction,
    type DocumentoQueNombra,
} from "@/actions/documentacion-actions";
import type { TipoDeMencion } from "@/lib/documentacion";

/**
 * Los documentos que nombran a esta cosa. **El otro sentido de la mención.**
 *
 * Es la mitad que hace que mencionar sirva de algo: sin esto, escribir el
 * nombre de un cliente dentro de un procedimiento sería un enlace de ida y
 * nadie llegaría nunca desde el cliente hasta lo que se escribió sobre él —que
 * es justo el momento en el que hace falta.
 *
 * Vive en `shared` y no dentro de Documentación porque lo pintan pantallas de
 * otros módulos: el diálogo de una tarea y el de un ticket. Con una copia en
 * cada uno, el día que se afine el filtro de permisos se afina en una y la otra
 * se queda enseñando de más.
 *
 * ## Lo que NO hace, a propósito
 *
 * **No se pinta nada mientras no haya nada que decir.** Un bloque «Documentos
 * relacionados (0)» dentro del diálogo de cada tarea es ruido en la pantalla
 * que más se usa, y lo que consigue es que se deje de mirar.
 */
export function DocumentosQueLoNombran({
    tipo,
    refId,
    titulo = "Se nombra en",
}: {
    tipo: TipoDeMencion;
    refId: string | number | null | undefined;
    titulo?: string;
}) {
    const [documentos, setDocumentos] = useState<DocumentoQueNombra[]>([]);

    useEffect(() => {
        const id = refId === null || refId === undefined ? "" : String(refId);
        if (!id) {
            setDocumentos([]);
            return;
        }

        let vivo = true;
        void (async () => {
            try {
                const res = await losDocumentosQueNombranAction({ tipo, refId: id });
                if (vivo && res.success) setDocumentos(res.data);
            } catch (error) {
                // Best-effort: esto es información de más dentro de una pantalla
                // que ya funciona, así que un fallo no puede estorbarla. Pero no
                // es mudo.
                console.warn("[documentacion] no se pudieron leer los retroenlaces", error);
            }
        })();
        return () => {
            vivo = false;
        };
    }, [tipo, refId]);

    if (documentos.length === 0) return null;

    return (
        <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
            <ul className="flex flex-col gap-1">
                {documentos.map((d) => (
                    <li key={d.id}>
                        <Link
                            href={`/documentos?documento=${encodeURIComponent(d.id)}`}
                            className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                        >
                            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{d.titulo}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {d.espacioNombre}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
