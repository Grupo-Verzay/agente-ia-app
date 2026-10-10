/**
 * El bucket de mentira del banco de los ADJUNTOS DE LAS NOTAS: solo recuerda
 * qué llaves se le pidió borrar, para afirmar que borrar una nota suelta sus
 * archivos del bucket (y que borrar otra cosa no suelta nada).
 */
export const quitados: Array<{ bucket: string; llave: string }> = [];
/** Las llaves cuyo borrado falla: borrar la nota no puede fallar por eso. */
export const fallan = new Set<string>();

export const minioClient = {
    async removeObject(bucket: string, llave: string) {
        if (fallan.has(llave)) throw new Error(`AccessDenied: ${llave}`);
        quitados.push({ bucket, llave });
    },
};
