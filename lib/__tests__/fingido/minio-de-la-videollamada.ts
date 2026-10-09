/**
 * El bucket de mentira del banco de la grabación de la videollamada: guarda en
 * memoria lo que se sube, lo devuelve como flujo, lo borra y lo JUNTA
 * (`composeObject`) pegando los bytes en el orden de las fuentes, que es lo
 * que hace S3. Sirve también como el módulo `minio` (las dos clases de copia).
 */
import { Readable } from "stream";

export const bucket = new Map<string, { bytes: Buffer; tipo: string }>();
/** Las llaves que `getObject` hace fallar (un trozo que se perdió). */
export const fallan = new Set<string>();

const llave = (b: string, o: string) => `${b}/${o}`;

export class CopyDestinationOptions {
    Bucket: string;
    Object: string;
    constructor(o: { Bucket: string; Object: string }) {
        this.Bucket = o.Bucket;
        this.Object = o.Object;
    }
}
export class CopySourceOptions {
    Bucket: string;
    Object: string;
    constructor(o: { Bucket: string; Object: string }) {
        this.Bucket = o.Bucket;
        this.Object = o.Object;
    }
}

export const minioClient = {
    async putObject(b: string, o: string, cuerpo: Buffer, _largo: number, meta?: Record<string, string>) {
        bucket.set(llave(b, o), { bytes: Buffer.from(cuerpo), tipo: meta?.["Content-Type"] ?? "" });
        return { etag: "banco" };
    },
    async getObject(b: string, o: string) {
        const k = llave(b, o);
        const f = bucket.get(k);
        if (!f || fallan.has(k)) throw new Error(`NoSuchKey: ${o}`);
        return Readable.from([f.bytes]);
    },
    async removeObject(b: string, o: string) {
        bucket.delete(llave(b, o));
    },
    async composeObject(destino: CopyDestinationOptions, fuentes: CopySourceOptions[]) {
        const partes = fuentes.map((f) => {
            const x = bucket.get(llave(f.Bucket, f.Object));
            if (!x) throw new Error(`falta la parte ${f.Object}`);
            return x;
        });
        // S3: toda parte menos la última pasa de 5 MiB, o la unión falla.
        partes.slice(0, -1).forEach((p, i) => {
            if (p.bytes.length < 5 * 1024 * 1024) throw new Error(`EntityTooSmall: parte ${i + 1}`);
        });
        bucket.set(llave(destino.Bucket, destino.Object), { bytes: Buffer.concat(partes.map((p) => p.bytes)), tipo: partes[0]?.tipo ?? "" });
        return { etag: "banco" };
    },
};
