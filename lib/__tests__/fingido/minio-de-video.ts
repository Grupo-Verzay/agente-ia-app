/**
 * El bucket de mentira del banco de la página de un plan: guarda lo que se
 * sube por `/api/upload-plan-video` —leyendo el flujo hasta el final, como hace
 * el de verdad— para poder comprobar qué bytes y qué tipo llegaron.
 */
import type { Readable } from "stream";

export const subidos: Array<{ bucket: string; ruta: string; bytes: Buffer; tipo: string; largo: number }> = [];

export const minioClient = {
    async putObject(bucket: string, ruta: string, flujo: Readable | Buffer, largo: number, meta: Record<string, string>) {
        let bytes: Buffer;
        if (Buffer.isBuffer(flujo)) {
            bytes = flujo;
        } else {
            const trozos: Buffer[] = [];
            for await (const t of flujo) trozos.push(Buffer.from(t));
            bytes = Buffer.concat(trozos);
        }
        subidos.push({ bucket, ruta, bytes, tipo: meta?.["Content-Type"] ?? "", largo });
        return { etag: "banco" };
    },
};
