/**
 * Las variables que recoge un paso del Motor de Flujo.
 *
 * El campo «Variable que recoge» es texto libre y siempre admitió escribir
 * varias —nadie lo impedía—, pero se volcaba en la tabla del prompt **tal
 * cual**, como una celda opaca. El agente leía «nombre, correo, ciudad» como
 * una sola cosa, y de ahí que unas veces esperara los tres datos y otras
 * avanzara con el primero: no había nada que dijera cuántas eran.
 *
 * Aquí se parten en una lista de verdad. Con eso el prompt puede enumerarlas y
 * exigirlas todas, que es lo que el motor del backend ya sabe hacer: sus reglas
 * razonan con `vars_requeridas` y `vars_faltantes`, en plural, y no avanzan
 * mientras quede alguna.
 *
 * El separador documentado es la **coma**. Se admiten también el punto y coma y
 * el salto de línea porque son lo que la gente escribe sin pensar, y tomarlos
 * por parte del nombre convertiría «nombre; correo» en una variable llamada así,
 * que es un fallo mudo de los que este proyecto tiene prohibidos.
 *
 * Es pura: entra una cadena y sale una lista. No sabe de pantallas ni de red.
 */
export function variablesDelPaso(campo: string | null | undefined): string[] {
    const texto = (campo ?? "").trim();
    if (!texto) return [];

    const vistas = new Set<string>();
    const variables: string[] = [];

    for (const trozo of texto.split(/[,;\n]+/)) {
        const nombre = trozo.trim();
        if (!nombre) continue;
        // Repetida no es dos: pedirla dos veces no la hace más obligatoria, y en
        // la tabla del prompt solo añade ruido.
        const clave = nombre.toLowerCase();
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        variables.push(nombre);
    }

    return variables;
}

/** Cómo se escribe la lista en la tabla del prompt. Vacía: una raya. */
export function variablesParaLaTabla(campo: string | null | undefined): string {
    const variables = variablesDelPaso(campo);
    return variables.length ? variables.join(", ") : "—";
}
