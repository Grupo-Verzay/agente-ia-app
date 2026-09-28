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
 *
 * Un PDF llega en base64 (`formato: "pdf"`, una acción de servidor devuelve
 * JSON) y se baja con sus bytes tal cual: con BOM delante dejaría de ser un
 * PDF. Varios PDF van en el mismo `.zip`, igual que varios `.txt`.
 */
const BOM = "﻿";

export interface ArchivoParaDescargar {
    nombre: string;
    contenido: string;
    /** Sin él, texto: así sigue funcionando lo que ya lo llamaba (Correo). */
    formato?: "txt" | "pdf";
}

/** Los bytes de un archivo tal como van al disco. Puro, para el banco. */
export function losBytesDelArchivo(a: ArchivoParaDescargar): Uint8Array | string {
    if (a.formato === "pdf") {
        const binario = atob(a.contenido);
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
        return bytes;
    }
    return BOM + a.contenido;
}

export function descargarExportacion(archivos: ArchivoParaDescargar[], nombreDelLote: string): void {
    if (archivos.length === 0) return;
    let blob: Blob;
    let nombre: string;
    if (archivos.length === 1) {
        const a = archivos[0];
        blob = new Blob([losBytesDelArchivo(a) as BlobPart], {
            type: a.formato === "pdf" ? "application/pdf" : "text/plain;charset=utf-8",
        });
        nombre = a.nombre;
    } else {
        const zip = crearZip(
            sinNombresRepetidos(archivos).map((a) => ({ nombre: a.nombre, contenido: losBytesDelArchivo(a) })),
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
