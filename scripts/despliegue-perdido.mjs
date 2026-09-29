// ¿Tiene su despliegue el último commit de main? Puro: no toca la red.
//
// Lo usa el vigilante (scripts/vigilar-despliegue.mjs), que corre cada diez
// minutos en GitHub Actions (.github/workflows/despliegue-perdido.yml), y su
// banco (scripts/banco-despliegue-perdido.sh).
//
// Por qué existe: el 29-09 se fusionó el #1047 (la guía de Leads con el menú
// y la barra de arriba) y GitHub NO creó ninguna corrida de docker-publish
// para ese commit. Ni roja ni cancelada: ninguna. Las fusiones de antes y de
// después sí la tuvieron. Producción se quedó en el #1046 sin que nada lo
// dijera, y lo que se vio desde fuera fue «el arreglo no se refleja»: la
// guía seguía con las letras sueltas del menú y el vídeo de 1:16.
//
// Un despliegue que cuelga de UN aviso de GitHub no tiene red. Esto es la red:
// se mira la FILA que queda escrita —la corrida de ese commit— y no la memoria
// de que alguien fusionó.

/** Cuánto se espera antes de dar por perdido el aviso de un push. */
export const MARGEN_ANTES_DE_LANZAR_MS = 10 * 60 * 1000;

/**
 * Las marcas con las que GitHub deja un push SIN corrida a propósito. Un
 * commit que las lleva no perdió su aviso: se pidió que no se construyera, y
 * el vigilante no puede ser la forma de saltarse esa decisión.
 */
export const MARCAS_DE_NO_CONSTRUIR = ["[skip ci]", "[ci skip]", "[no ci]", "[skip actions]", "[actions skip]"];

export function pidioNoConstruir(mensaje) {
    const m = String(mensaje ?? "").toLowerCase();
    return MARCAS_DE_NO_CONSTRUIR.some((marca) => m.includes(marca));
}

/** Una corrida que todavía no terminó: en cola, esperando turno o corriendo. */
export function estaEnCurso(corrida) {
    return corrida?.status !== "completed";
}

/**
 * Qué hacer con el último commit de la rama.
 *
 * - `nada`     : ya tiene su corrida (desplegando, desplegada, en rojo o
 *                cancelada a mano).
 * - `esperar`  : no tiene corrida pero es de hace menos del margen: el aviso
 *                del push puede estar llegando todavía.
 * - `lanzar`   : no tiene NINGUNA corrida y ya pasó el margen. El aviso se
 *                perdió y hay que lanzarla a mano (workflow_dispatch).
 *
 * Lo que NO se relanza, a propósito:
 * - una corrida EN ROJO. Ya es la señal —GitHub avisa y el comprobador dice
 *   «atrasado»— y relanzarla cada diez minutos quemaría una construcción rota
 *   en bucle. Un fallo de construcción se arregla, no se reintenta.
 * - una corrida CANCELADA. Alguien la paró: esa decisión no la deshace un
 *   vigilante.
 * - un commit con `[skip ci]` o parecido: no tiene corrida porque se pidió.
 *
 * Y sin fecha legible se LANZA: el lado seguro aquí es desplegar dos veces el
 * mismo commit —que no cambia nada— y no dejar producción atrás en silencio,
 * que es justo el fallo.
 */
export function queHacerConElUltimoCommit({ head, corridas, ahora, margenMs = MARGEN_ANTES_DE_LANZAR_MS }) {
    const sha = head?.sha;
    if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
        return { accion: "nada", estado: "sin_commit", motivo: "no se pudo leer el último commit de la rama" };
    }
    const suyas = (Array.isArray(corridas) ? corridas : []).filter((c) => c?.head_sha === sha);

    if (suyas.some(estaEnCurso)) {
        return { accion: "nada", estado: "desplegando", motivo: `la corrida de ${sha.slice(0, 7)} está en curso` };
    }
    if (suyas.some((c) => c.conclusion === "success")) {
        return { accion: "nada", estado: "desplegado", motivo: `${sha.slice(0, 7)} ya se construyó y se desplegó` };
    }
    if (suyas.some((c) => c.conclusion && c.conclusion !== "cancelled" && c.conclusion !== "skipped")) {
        return {
            accion: "nada",
            estado: "fallida",
            motivo: `la corrida de ${sha.slice(0, 7)} terminó en rojo: se arregla la construcción, no se relanza en bucle`,
        };
    }
    if (suyas.length > 0) {
        return { accion: "nada", estado: "cancelada", motivo: `la corrida de ${sha.slice(0, 7)} se canceló o se saltó: eso lo decidió alguien` };
    }
    if (pidioNoConstruir(head?.mensaje)) {
        return { accion: "nada", estado: "sin_construir", motivo: `${sha.slice(0, 7)} pidió no construirse ([skip ci] o parecido)` };
    }

    const fecha = Date.parse(head?.fecha ?? "");
    if (!Number.isNaN(fecha) && ahora - fecha < margenMs) {
        return {
            accion: "esperar",
            estado: "reciente",
            motivo: `${sha.slice(0, 7)} es de hace menos de ${Math.round(margenMs / 60000)} min: su corrida puede estar llegando`,
        };
    }
    return {
        accion: "lanzar",
        estado: "perdido",
        motivo: `${sha.slice(0, 7)} no tiene NINGUNA corrida de despliegue: el aviso del push se perdió`,
    };
}
