"use client";

import { crearZip } from "@/lib/zip-sencillo";
import { sinNombresRepetidos } from "@/lib/conversacion-legible";

/**
 * Bajar lo exportado, en el navegador. Lo usan Chats y Correo.
 *
 * **Uno sale como `.txt`; varios, como un `.zip` con un `.txt` por cada uno**,
 * que es lo que hace WhatsApp. Un `.txt` pegado con todo dentro obligaría a
 * separarlo a mano para guardar una conversación suelta.
 *
 * El `.txt` lleva la marca BOM de UTF-8 delante: sin ella el Bloc de notas de
 * Windows viejo abre los acentos rotos, y es justo donde la gente abre esto.
 */
const BOM = "﻿";

export function descargarExportacion(
    archivos: { nombre: string; contenido: string }[],
    nombreDelLote: string,
): void {
    if (archivos.length === 0) return;
    let blob: Blob;
    let nombre: string;
    if (archivos.length === 1) {
        blob = new Blob([BOM + archivos[0].contenido], { type: "text/plain;charset=utf-8" });
        nombre = archivos[0].nombre;
    } else {
        const zip = crearZip(
            sinNombresRepetidos(archivos).map((a) => ({ nombre: a.nombre, contenido: BOM + a.contenido })),
        );
        blob = new Blob([zip as BlobPart], { type: "application/zip" });
        nombre = nombreDelLote.endsWith(".zip") ? nombreDelLote : `${nombreDelLote}.zip`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Se suelta después: revocarlo en el mismo turno corta la descarga en Safari.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** La zona del navegador, que es la de quien va a leer el archivo. */
export function laZonaDeQuienMira(): string | undefined {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
        return undefined;
    }
}
