import {
    elDocumento,
    elEspacio,
    losEspaciosCandidatos,
    losPermisosDe,
    type Documento,
    type Espacio,
} from "@/lib/documentacion-db";
import {
    accesoAlDocumento,
    accesoAlEspacio,
    laCuentaDeQuienMira,
    type Acceso,
    type FilaDePermiso,
    type QuienMira,
} from "@/lib/documentacion-permisos";

/**
 * La puerta de la documentación, resuelta contra la base.
 *
 * Aquí solo se **traen filas**; quién pasa lo decide `documentacion-permisos`,
 * que es puro y está probado. Es el mismo reparto que en la Actividad del
 * equipo: la consulta trae, la función pura decide.
 *
 * **Todo lo que lista y todo lo que abre pasa por aquí.** Es la regla que ya
 * costó un chat que se podía anclar y no se podía borrar: con la condición
 * escrita en cada acción, la octava se olvida.
 */

export type EspacioConAcceso = { espacio: Espacio; acceso: Acceso };

/**
 * Los espacios que alguien alcanza de verdad, ya filtrados, con sus permisos.
 *
 * Se devuelven **también los permisos en crudo** porque quien llama los
 * necesita para decidir sobre los documentos de dentro sin volver a la base:
 * el árbol de un espacio son decenas de documentos y preguntar por cada uno
 * sería «muchas peticiones pequeñas son turno, no trabajo», por dentro.
 */
export async function losEspaciosQueAlcanza(
    user: QuienMira,
): Promise<{
    espacios: EspacioConAcceso[];
    contenedores: EspacioConAcceso[];
    permisos: FilaDePermiso[];
}> {
    const cuenta = laCuentaDeQuienMira(user);
    const persona = (user?.id || "").trim();
    if (!cuenta || !persona) return { espacios: [], contenedores: [], permisos: [] };

    const { espacios, permisos, porDocumento } = await losEspaciosCandidatos({ cuenta, persona });
    const soloPorDentro = new Set(porDocumento);

    const alcanzados: EspacioConAcceso[] = [];
    const contenedores: EspacioConAcceso[] = [];
    for (const espacio of espacios) {
        const acceso = accesoAlEspacio(user, espacio, permisos);
        if (acceso) {
            alcanzados.push({ espacio, acceso });
            continue;
        }
        // **No alcanza el espacio, pero sí un documento de dentro.** Se
        // devuelve aparte, con un acceso de solo mirar, y sirve para una cosa
        // y una sola: que el documento compartido tenga dónde salir en el
        // árbol y se sepa cómo se llama el sitio donde vive.
        //
        // **Esto NO es acceso al espacio**, y por eso no se mezcla con los de
        // arriba: quien decide sobre cada documento es `accesoAlDocumento`, y
        // si le llegara este espacio como alcanzado daría por buenos **todos**
        // los documentos de dentro —el espacio decide, el documento solo
        // añade—. Sería regalar el espacio entero por haber compartido una
        // hoja.
        if (soloPorDentro.has(espacio.id)) {
            contenedores.push({
                espacio,
                acceso: {
                    cuentaId: espacio.cuentaId,
                    recibido: true,
                    puedeEditar: false,
                    puedeGestionar: false,
                },
            });
        }
    }
    return { espacios: alcanzados, contenedores, permisos };
}

export type DocumentoConAcceso = { documento: Documento; acceso: Acceso };

/**
 * `null` si no lo alcanza — y eso incluye «no existe».
 *
 * Decir «no puedes» ya revela que existe y de quién es. Misma regla que
 * `getFlowAction` y que `accesoAlProyecto`.
 */
export async function accesoAEsteDocumento(
    user: QuienMira,
    documentoId: string,
): Promise<DocumentoConAcceso | null> {
    const documento = await elDocumento(documentoId);
    if (!documento) return null;

    const espacio = await elEspacio(documento.espacioId);

    // Las filas que le tocan a quien mira, de este documento y de su espacio.
    // Se piden juntas: son dos consultas pequeñas y la decisión las necesita a
    // la vez, porque el documento solo puede AÑADIR sobre lo que da el espacio.
    const [delDocumento, delEspacio] = await Promise.all([
        losPermisosDe({ objetoTipo: "documento", objetoId: documento.id }),
        espacio
            ? losPermisosDe({ objetoTipo: "espacio", objetoId: espacio.id })
            : Promise.resolve([] as FilaDePermiso[]),
    ]);

    const acceso = accesoAlDocumento(user, documento, espacio, [
        ...delDocumento,
        ...delEspacio,
    ]);
    if (!acceso) return null;

    return { documento, acceso };
}

/** Lo mismo para un espacio. */
export async function accesoAEsteEspacio(
    user: QuienMira,
    espacioId: string,
): Promise<EspacioConAcceso | null> {
    const espacio = await elEspacio(espacioId);
    if (!espacio) return null;

    const permisos = await losPermisosDe({ objetoTipo: "espacio", objetoId: espacio.id });
    const acceso = accesoAlEspacio(user, espacio, permisos);
    if (!acceso) return null;

    return { espacio, acceso };
}

/**
 * Filtra una lista de documentos ya traída, con los permisos ya en la mano.
 *
 * Es lo que usan el árbol, la búsqueda y los retroenlaces, y **es el mismo
 * criterio que abrir**: un documento que sale en una lista y al pulsarlo dice
 * «No autorizado» no se lee como un permiso, se lee como que la App está rota.
 */
export function losQueAlcanzaDeEstos<
    T extends {
        id: string;
        cuentaId: string;
        espacioId: string;
        restringido: boolean;
        creadoPorId: string;
    },
>(
    user: QuienMira,
    documentos: T[],
    espacios: Map<string, Espacio>,
    permisos: FilaDePermiso[],
): T[] {
    return documentos.filter((documento) =>
        Boolean(
            accesoAlDocumento(user, documento, espacios.get(documento.espacioId) ?? null, permisos),
        ),
    );
}
