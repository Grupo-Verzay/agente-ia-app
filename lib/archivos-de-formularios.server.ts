import "server-only";

import { laCarpetaDelFormulario } from "@/lib/formularios";

/**
 * Dónde viven los archivos que adjunta quien llena un formulario público.
 *
 * Lo leen DOS sitios que tienen que decir lo mismo: la ruta que los sube
 * (`/api/upload-form-file`) y el envío (`submitFormResponse`), que solo acepta
 * un archivo si su dirección empieza por la carpeta de ESE formulario. Con la
 * cuenta escrita en cada uno, el día que cambie el bucket el envío rechazaría
 * todos los archivos buenos.
 */
export const BUCKET_DE_FORMULARIOS = process.env.S3_BUCKET_NAME || "verzay-media";

function laBase(): string {
    return (process.env.S3_PUBLIC_URL || "").replace(/\/$/, "");
}

/** La dirección pública de una llave del bucket. */
export function laUrlDelArchivo(llave: string): string {
    return `${laBase()}/${BUCKET_DE_FORMULARIOS}/${llave}`;
}

/** El principio de la dirección de todo lo que se sube a un formulario. */
export function elPrefijoDeArchivos(formId: string): string {
    return laUrlDelArchivo(laCarpetaDelFormulario(formId));
}
