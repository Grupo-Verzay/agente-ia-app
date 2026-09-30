/**
 * Google Sheets de mentira, para el banco de Mis formularios.
 *
 * Imita lo que de verdad hace Google con las pestañas, que es de donde salían
 * los errores de producción: `addSheet` con un nombre que YA existe —sin mirar
 * mayúsculas ni espacios de los lados— revienta con el mismo mensaje que da
 * Google («A sheet with the name … already exists»). Así el código de antes
 * reproduce el fallo que dejó tres registros en «Error», y el de ahora no.
 */
type Llamada = { que: string; hoja: string; pestana?: string; rango?: string; valores?: unknown[][] };

const estado: { pestanas: string[]; llamadas: Llamada[]; falla: string | null } = {
    pestanas: [],
    llamadas: [],
    falla: null,
};

export function laHojaDeMentira() {
    return estado;
}

export function ponerLaHoja(pestanas: string[], falla: string | null = null) {
    estado.pestanas = [...pestanas];
    estado.llamadas = [];
    estado.falla = falla;
}

const mismoNombre = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

class GoogleAuth {
    constructor(_opciones: unknown) {}
}

function sheets(_opciones: unknown) {
    return {
        spreadsheets: {
            async get({ spreadsheetId }: { spreadsheetId: string }) {
                if (estado.falla) throw new Error(estado.falla);
                estado.llamadas.push({ que: "get", hoja: spreadsheetId });
                return { data: { sheets: estado.pestanas.map((title) => ({ properties: { title } })) } };
            },
            async batchUpdate({ spreadsheetId, requestBody }: { spreadsheetId: string; requestBody: { requests: Array<{ addSheet?: { properties: { title: string } } }> } }) {
                for (const r of requestBody.requests) {
                    const nombre = r.addSheet?.properties.title ?? "";
                    if (estado.pestanas.some((p) => mismoNombre(p, nombre))) {
                        throw new Error(`Invalid requests[0].addSheet: A sheet with the name "${nombre}" already exists. Please enter another name.`);
                    }
                    estado.pestanas.push(nombre);
                    estado.llamadas.push({ que: "addSheet", hoja: spreadsheetId, pestana: nombre });
                }
                return { data: {} };
            },
            values: {
                async append({ spreadsheetId, range, requestBody }: { spreadsheetId: string; range: string; requestBody: { values: unknown[][] } }) {
                    estado.llamadas.push({ que: "append", hoja: spreadsheetId, rango: range, valores: requestBody.values });
                    return { data: {} };
                },
            },
        },
    };
}

export const google = { auth: { GoogleAuth }, sheets };
export default { google };
