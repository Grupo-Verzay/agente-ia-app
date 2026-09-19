/**
 * Lo que sale del editor NO es JSON plano, y por eso no puede cruzar a una
 * acción de servidor tal cual.
 *
 * ProseMirror construye los `attrs` de cada nodo y de cada marca con
 * `Object.create(null)` —`computeAttrs`, en `prosemirror-model`— y `toJSON()`
 * los asigna **por referencia**:
 *
 * ```js
 * toJSON() { let obj = { type: this.type.name }
 *            for (let _ in this.attrs) { obj.attrs = this.attrs; break } … }
 * ```
 *
 * Así que `editor.getJSON()` devuelve un árbol con objetos **sin prototipo**
 * dentro en cuanto un nodo tiene atributos —y con `TextAlign` configurado eso
 * es **cada párrafo y cada encabezado**, o sea siempre—. Next se niega a
 * serializarlos:
 *
 * > Only plain objects, and a few built-ins, can be passed to Server Actions.
 * > Classes or null prototypes are not supported.
 *
 * Y ese rechazo ocurre **en el navegador**, dentro de `encodeReply`: la
 * petición **no llega a salir**. De ahí el síntoma que costó esta vuelta: el
 * documento se quedaba en «Sin guardar», el servidor no escribía **ni una
 * línea** en su registro —porque la acción nunca corrió— y el aviso que veía la
 * persona era «No se pudo completar. Revisa la conexión.», que manda a mirar la
 * red cuando la red no tiene nada que ver. En producción **ningún documento
 * pasó nunca de la versión 1**.
 *
 * Notas ya lo esquivaba con un `JSON.parse(JSON.stringify(...))` suelto y **sin
 * decir por qué**, así que Documentación —que reutilizó el mismo editor— no lo
 * copió: nadie sabía que hacía falta. Por eso esto es una función con nombre y
 * con el motivo escrito, y se aplica **en el editor**, que es el único sitio
 * que produce el problema. Quien lo arregle en cada pantalla está firmando que
 * la siguiente se lo olvide.
 *
 * Lo que cuesta, medido en este mismo Node con árboles de párrafos:
 *
 * | documento | por vuelta |
 * | --- | --- |
 * | 27 kB | 0,21 ms |
 * | 268 kB | 2,20 ms |
 * | 2,7 MB | 17,6 ms |
 *
 * Se paga en cada tecla, y se acepta: 268 kB ya es un documento larguísimo, y
 * un documento de 2,7 MB pasa de largo el tope de indexado
 * (`TOPE_DE_TEXTO_INDEXADO`). `getJSON()` ya recorre el árbol entero y reserva
 * uno nuevo en cada tecla, así que esto multiplica una constante, no el orden.
 */

/**
 * El mismo valor, con objetos y arreglos normales.
 *
 * `undefined` se devuelve tal cual: `JSON.stringify(undefined)` no es una
 * cadena y `JSON.parse` de eso revienta.
 */
export function comoJsonPlano<T>(valor: T): T {
    if (valor === undefined) return valor;
    return JSON.parse(JSON.stringify(valor)) as T;
}
