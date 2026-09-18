"use server";

import { currentUser } from "@/lib/auth";
import { puedeVerLaAnaliticaDeLaCasa } from "@/lib/analitica-de-la-casa";
import {
    comoProveedor,
    losAvisosDeSalud,
    resumirPorProveedor,
    type AvisoDeSalud,
    type EnvioAutomatico,
    type ResumenDeProveedor,
} from "@/lib/salud-del-envio";
import {
    DIAS_QUE_SE_GUARDAN,
    lasCuentasConEnvios,
    losEnviosRecientes,
    TOPE_DE_LA_LISTA,
} from "@/lib/salud-del-envio-db";

/**
 * Salud del envío: lo que la pantalla necesita, y la puerta.
 *
 * **La puerta está aquí, no en la página**, que es la regla de siempre: la
 * pantalla pinta lo que esto le devuelva, así que no puede abrir más de lo que
 * la consulta deja. Y se pregunta con `puedeVerLaAnaliticaDeLaCasa`, la misma
 * función que ya decide quién ve la Analítica interna, en vez de escribir aquí
 * una condición de rol nueva — que es exactamente lo que dejó a media gente
 * fuera en Clientes, Equipo y Analíticas.
 */

export type VistaDeLaSalud = {
    dias: number;
    envios: EnvioAutomatico[];
    resumen: ResumenDeProveedor[];
    avisos: AvisoDeSalud[];
    /** Las cuentas que aparecen en la ventana, para el desplegable. */
    cuentas: Array<{ id: string; nombre: string | null }>;
    /** La lista viene al tope y hay más detrás. */
    alTope: boolean;
    tope: number;
    maximoDeDias: number;
};

export type FiltrosPedidos = {
    dias?: number;
    proveedor?: string | null;
    cuentaId?: string | null;
    estado?: string | null;
};

/**
 * Devuelve `null` a quien no pueda verla, y entonces la pantalla no se pinta.
 *
 * Es lo mismo que hacen las tres tarjetas internas de Analíticas: un `null` es
 * «no es para ti», no un error, y evita que la pantalla tenga que volver a
 * preguntar por el rol y discrepar con la consulta.
 */
export async function leerLaSaludDelEnvio(
    filtros: FiltrosPedidos = {},
): Promise<VistaDeLaSalud | null> {
    const user = await currentUser();
    if (!user) return null;
    if (!(await puedeVerLaAnaliticaDeLaCasa(user))) return null;

    const dias = Math.max(1, Math.min(Math.trunc(Number(filtros.dias)) || 7, DIAS_QUE_SE_GUARDAN));
    // Lo que llega del navegador pasa por la lista cerrada. Un proveedor
    // inventado no puede acabar en el `WHERE`.
    const proveedor = comoProveedor(filtros.proveedor);
    const estado =
        filtros.estado === "salio" || filtros.estado === "fallo" ? filtros.estado : "todos";
    const cuentaId = filtros.cuentaId?.trim() || null;

    try {
        const [envios, cuentas] = await Promise.all([
            losEnviosRecientes({ dias, proveedor, cuentaId, estado }),
            lasCuentasConEnvios(dias),
        ]);

        // **El resumen y los avisos salen de la ventana SIN filtrar por estado
        // ni por cuenta.** Con el filtro puesto en «solo fallos», el resumen
        // diría «100 % de fallo» en los tres proveedores y el aviso destacado
        // saltaría siempre: un número que depende de lo que el usuario acabe de
        // pulsar no mide nada. Lo único que comparten es la ventana de días.
        const todos =
            proveedor || cuentaId || estado !== "todos"
                ? await losEnviosRecientes({ dias, estado: "todos" })
                : envios;

        const resumen = resumirPorProveedor(todos);

        return {
            dias,
            envios,
            resumen,
            avisos: losAvisosDeSalud(resumen, new Date()),
            cuentas,
            alTope: envios.length >= TOPE_DE_LA_LISTA,
            tope: TOPE_DE_LA_LISTA,
            maximoDeDias: DIAS_QUE_SE_GUARDAN,
        };
    } catch (error) {
        // Una pantalla de salud que se cae en silencio es el chiste que viene a
        // contar. Se dice, y se devuelve `null` para que salga «no se pudo
        // cargar» en vez de una pantalla en blanco que parece «no pasa nada».
        console.warn("[salud-envio] no se pudo leer el registro", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
