/**
 * Qué está plegado en el árbol de Documentación: **los espacios y las
 * carpetas**, con la misma regla y el mismo código.
 *
 * Es una sola función con un discriminante y no dos módulos copiados a
 * propósito: la parte delicada de esto —el `try` de cada acceso, el borrado de
 * la entrada al quedarse vacía, el `null` cuando no había nada que desplegar—
 * es exactamente igual para los dos, y con dos copias el día que se afine una
 * la otra se queda atrás. Eso no se ve como un error: se ve como que «las
 * carpetas a veces no recuerdan si estaban plegadas».
 *
 * # Se guarda lo PLEGADO, no lo desplegado
 *
 * Es al revés de lo que parece y de ahí salen las dos mitades del encargo sin
 * escribir ninguna rama:
 *
 * - **Lo que nunca se ha tocado nace desplegado**, porque no está en el
 *   conjunto. No hay que sembrar nada la primera vez ni acordarse de añadir lo
 *   que se cree después, que es justo donde se olvidaría uno.
 * - **Y lo guardado no crece con el árbol.** Guardando lo desplegado, una
 *   cuenta con cuarenta espacios escribiría cuarenta ids para decir que no ha
 *   tocado nada.
 *
 * # Por qué en el navegador y no en la base
 *
 * Es una preferencia de vista de **esta persona y este equipo**, no un dato
 * compartido: en la base sería una escritura por cada pliegue —lo más frecuente
 * que se hace en el árbol— para devolver algo que no importa si se pierde. Si
 * no está, todo sale desplegado, que es exactamente como se comportaba antes.
 *
 * # Y la llave lleva la CUENTA y la PERSONA
 *
 * Las dos, igual que `llaveDelUltimoCanal`, y cada una tapa un caso distinto:
 * la **cuenta** porque la lista depende de ella —con «Ingresar» o con el
 * conmutador se entra a otro sitio, donde esos ids no existen—, y la
 * **persona** porque dos personas en el mismo navegador no pueden pisarse, y
 * dentro de una cuenta lo que cada una alcanza no es lo mismo.
 *
 * Nada de esto es una puerta: qué espacios y qué carpetas hay lo decide el
 * servidor. Esto solo decide cuáles se ven abiertos.
 */

/** Las dos capas del árbol que se pliegan. */
export type QueSePliega = "espacios" | "carpetas";

/**
 * La llave, con `::` y no `_` como separador.
 *
 * Lo desmintió el banco del chat de equipo y vale igual aquí: un id con un
 * guion bajo dentro hace que («a», «b_c») y («a_b», «c») den la MISMA llave, o
 * sea la preferencia de una persona abriéndose en la sesión de otra. Hoy los
 * ids son UUID y no puede pasar, pero `::` es además el separador que ya usan
 * `llaveDelDirecto` y las llaves `linea::numero` de Chats.
 *
 * **La de los espacios no cambió al generalizar esto**, y eso no es casualidad:
 * si hubiera cambiado, todo el mundo habría perdido de golpe lo que tenía
 * plegado el día del despliegue. El banco compara la cadena entera.
 */
export function llaveDeLoPlegado(
    que: QueSePliega,
    cuentaId: string,
    personaId: string,
): string {
    return `documentacion_${que}_plegados_${cuentaId || "sin-cuenta"}::${
        personaId || "sin-persona"
    }`;
}

/**
 * Lo guardado, como conjunto. **Nunca lanza**, y eso no es un detalle.
 *
 * En una ventana privada, con las cookies de sitio bloqueadas o dentro de una
 * previsualización, tocar `localStorage` **tira una excepción**. Sin el `try`,
 * esa excepción sale en la primera carga y el árbol entero se queda sin pintar:
 * una preferencia de comodidad tumbando la pantalla justo en los navegadores
 * donde más se cuida la privacidad.
 *
 * Y lo que no se entienda cae en «nada plegado», que es el lado seguro: se ve
 * de más, nunca de menos. Un árbol que esconde espacios por un dato rancio se
 * lee como que los espacios desaparecieron.
 */
export function loPlegado(
    que: QueSePliega,
    cuentaId: string,
    personaId: string,
): Set<string> {
    try {
        const crudo = localStorage.getItem(llaveDeLoPlegado(que, cuentaId, personaId));
        if (!crudo) return new Set();
        const leido: unknown = JSON.parse(crudo);
        if (!Array.isArray(leido)) return new Set();
        return new Set(
            leido.filter((x): x is string => typeof x === "string" && x.trim() !== ""),
        );
    } catch {
        return new Set();
    }
}

/** Guardar, con el mismo `try` y por el mismo motivo. */
export function guardarLoPlegado(
    que: QueSePliega,
    cuentaId: string,
    personaId: string,
    plegados: Iterable<string>,
): void {
    try {
        const llave = llaveDeLoPlegado(que, cuentaId, personaId);
        const lista = [...plegados].filter((id) => typeof id === "string" && id.trim() !== "");
        // Sin nada plegado se BORRA la entrada en vez de escribir `[]`: el
        // estado por defecto no ocupa sitio, y así una llave vieja de una cuenta
        // que ya no se usa se limpia sola al desplegarlo todo.
        if (lista.length === 0) localStorage.removeItem(llave);
        else localStorage.setItem(llave, JSON.stringify(lista));
    } catch {
        // Sin `localStorage` no hay preferencia y todo sale desplegado, que es
        // exactamente como se comportaba esto antes.
    }
}

/** Alternar uno. Devuelve un conjunto nuevo: el de dentro no se toca. */
export function alternarEnElArbol(plegados: ReadonlySet<string>, id: string): Set<string> {
    const nuevo = new Set(plegados);
    if (nuevo.has(id)) nuevo.delete(id);
    else nuevo.add(id);
    return nuevo;
}

/**
 * Desplegar uno, y **`null` cuando no había nada que desplegar**.
 *
 * Eso segundo es lo que hace utilizable la regla de «lo que contiene al
 * documento abierto se despliega solo»: se llama cada vez que cambia el
 * documento abierto, y casi siempre ya está desplegado. Devolviendo un conjunto
 * nuevo igual al anterior se escribiría en `localStorage` y se repintaría el
 * árbol entero en cada clic, para no cambiar nada.
 */
export function desplegarEnElArbol(
    plegados: ReadonlySet<string>,
    id: string,
): Set<string> | null {
    if (!id || !plegados.has(id)) return null;
    const nuevo = new Set(plegados);
    nuevo.delete(id);
    return nuevo;
}
