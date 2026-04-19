// schema/seguimientos.ts
import { z } from "zod"

export const seguimientosSchema = z.object({
    idNodo: z.string(),
    serverurl: z.string().optional(),
    instancia: z.string().optional(),
    apikey: z.string().optional(),
    remoteJid: z.string().optional(),
    mensaje: z.string().optional(),
    tipo: z.string().optional(),
    time: z.string().optional(),
    name_file: z.string().optional(),
    consecutivo: z.string().optional(),
    media: z.string().optional(),
})

export type SeguimientoInput = z.infer<typeof seguimientosSchema>
