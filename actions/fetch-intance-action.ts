import { z } from "zod";

const FetchInstancesSchema = z.object({
    evoUrl: z.string().min(5, "La URL de evolution es obligatoria"),
    evoApiKey: z.string().min(5, "La API Key es obligatoria"),
    instanceName: z.string().min(1, "El nombre de la instancia es obligatorio"),
})

const EvolutionInstanceSchema = z.object({
    id: z.string(),
    name: z.string(),
    ownerJid: z.string(),
    profileName: z.string().nullable(),
    profilePicUrl: z.string().url().nullable(),
    connectionStatus: z.string(),
    number: z.string().nullable(),
    token: z.string(),
    clientName: z.string(),
    disconnectionReasonCode: z.number().nullable(),
    disconnectionAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    _count: z.object({
        Message: z.number(),
        Contact: z.number(),
        Chat: z.number()
    })
});

/** Lo que se espera a Evolution antes de dar la linea por no disponible. */
const TIEMPO_MAXIMO_MS = 8000;

export type EvolutionSchemaType = z.infer<typeof FetchInstancesSchema>
export type EvolutionInstance = z.infer<typeof EvolutionInstanceSchema>

interface ResponseFormat {
    success: boolean
    message: string
    data?: EvolutionInstance[]
}

//Obtiene los datos de evolution
export async function fetchInstanceAction(form: EvolutionSchemaType): Promise<ResponseFormat> {
    const parse = FetchInstancesSchema.safeParse(form)

    if (!parse.success) {
        return {
            success: false,
            message: parse.error.errors.map(e => e.message).join(', ')
        }
    }

    const { evoUrl, evoApiKey, instanceName } = parse.data

    // Perfil y Conexion se pintan en el servidor y esperan a esta consulta. Sin
    // limite de tiempo, un Evolution caido o lento dejaba la pagina cargando para
    // siempre: la App parecia rota entera aunque todo lo demas estuviera bien.
    // Con el corte, la pagina sale igual y solo falta el estado de la linea.
    const corte = new AbortController();
    const temporizador = setTimeout(() => corte.abort(), TIEMPO_MAXIMO_MS);

    try {
        const res = await fetch(`https://${evoUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, {
            method: 'GET',
            headers: {
                'apikey': evoApiKey,
                'Accept': 'application/json'
            },
            cache: 'no-store',
            signal: corte.signal
        })

        if (!res.ok) {
            return {
                success: false,
                message: `Error al consultar Evolution API: ${res.status} ${res.statusText}`
            }
        }

        const data: EvolutionInstance[] = await res.json()

        return {
            success: true,
            message: 'Instancia obtenidas correctamente',
            data
        }

    } catch (error: any) {
        if (error?.name === 'AbortError') {
            return {
                success: false,
                message: 'Evolution no respondio a tiempo.'
            }
        }
        return {
            success: false,
            message: `Error inesperado: ${error.message || error}`
        }
    } finally {
        clearTimeout(temporizador)
    }
}