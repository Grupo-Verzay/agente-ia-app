/**
 * El bucket de mentira del banco de Cotizaciones: guarda lo que se sube para
 * poder leer el PDF después. El `putObject` de verdad habla con MinIO.
 */
export const subidos: Array<{ bucket: string; ruta: string; bytes: Buffer; tipo: string }> = [];

export const minioClient = {
    async putObject(bucket: string, ruta: string, buffer: Buffer, _largo: number, meta: Record<string, string>) {
        subidos.push({ bucket, ruta, bytes: Buffer.from(buffer), tipo: meta?.["Content-Type"] ?? "" });
        return { etag: "banco" };
    },
};
