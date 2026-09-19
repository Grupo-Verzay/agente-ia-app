/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Lo que sale del editor tiene objetos SIN prototipo dentro, y eso no
 *   cruza a una accion de servidor.**
 *
 * De donde sale: `/documentos` no guardaba **nada**. En produccion los dos
 * documentos que habia seguian en la version 1 con el texto vacio, el servidor
 * no escribia ni una linea en su registro, y lo que veia la persona era «No se
 * pudo completar. Revisa la conexion.» — que manda a mirar la red cuando la
 * red no tiene nada que ver.
 *
 * Reproducido sobre el build servido, con sesion de verdad:
 *
 *   [documentacion] la accion no llego al servidor
 *   Error: Only plain objects, and a few built-ins, can be passed to Server
 *   Actions. Classes or null prototypes are not supported.
 *       at JSON.stringify ... at t.encodeReply
 *
 * `encodeReply` corre en el NAVEGADOR: la peticion no llega a salir. De ahi
 * que el servidor no tuviera nada que contar.
 *
 * La causa es de `prosemirror-model`: `computeAttrs` construye los `attrs` con
 * `Object.create(null)` y `Node.toJSON()` los asigna **por referencia**. Con
 * `TextAlign` configurado —lo esta— cada parrafo y cada encabezado llevan
 * atributos, o sea que pasa siempre.
 *
 * `lib/json-plano.ts` no importa NADA, asi que basta transpilarlo:
 *
 *   npx tsc lib/json-plano.ts --outDir lib/__tests__/.compilado \
 *     --module esnext --target es2022 --moduleResolution bundler
 *
 * y correr:  node --test lib/__tests__/json-plano.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compilado = path.join(path.dirname(fileURLToPath(import.meta.url)), ".compilado");
const { comoJsonPlano } = await import(path.join(compilado, "json-plano.js"));

/** Un `attrs` como el que construye ProseMirror: sin prototipo. */
function attrs(valores) {
    const a = Object.create(null);
    for (const [k, v] of Object.entries(valores)) a[k] = v;
    return a;
}

/** Lo que devuelve `editor.getJSON()` con `TextAlign` puesto. */
const comoLoDaElEditor = () => ({
    type: "doc",
    content: [
        {
            type: "heading",
            attrs: attrs({ level: 1, textAlign: null }),
            content: [{ type: "text", text: "Procedimiento" }],
        },
        {
            type: "paragraph",
            attrs: attrs({ textAlign: null }),
            content: [
                { type: "text", text: "para " },
                {
                    type: "mencionDeDocumentacion",
                    attrs: attrs({ tipo: "cliente", refId: "abc", etiqueta: "Acme" }),
                },
            ],
        },
    ],
});

/**
 * La comprobacion que de verdad importa: la MISMA que hace Next.
 *
 * No se puede llamar a su `encodeReply` desde aqui, pero su condicion si se
 * puede escribir, y es esta: recorrer el arbol y exigir que ningun objeto
 * tenga un prototipo que no sea `Object.prototype`.
 */
function elPrimeroSinPrototipo(valor, donde = "$") {
    if (Array.isArray(valor)) {
        for (let i = 0; i < valor.length; i++) {
            const malo = elPrimeroSinPrototipo(valor[i], `${donde}[${i}]`);
            if (malo) return malo;
        }
        return null;
    }
    if (valor && typeof valor === "object") {
        if (Object.getPrototypeOf(valor) !== Object.prototype) return donde;
        for (const [k, v] of Object.entries(valor)) {
            const malo = elPrimeroSinPrototipo(v, `${donde}.${k}`);
            if (malo) return malo;
        }
    }
    return null;
}

test("el banco reproduce el fallo: lo que da el editor NO es plano", () => {
    const crudo = comoLoDaElEditor();
    // Sin esto, el resto del banco pasaria aunque la causa no existiera.
    assert.equal(elPrimeroSinPrototipo(crudo), "$.content[0].attrs");
});

test("y son TRES los nodos con atributos, no uno suelto", () => {
    const crudo = comoLoDaElEditor();
    const sinPrototipo = [];
    const mirar = (v, d = "$") => {
        if (Array.isArray(v)) return v.forEach((x, i) => mirar(x, `${d}[${i}]`));
        if (v && typeof v === "object") {
            if (Object.getPrototypeOf(v) !== Object.prototype) sinPrototipo.push(d);
            Object.entries(v).forEach(([k, x]) => mirar(x, `${d}.${k}`));
        }
    };
    mirar(crudo);
    assert.equal(sinPrototipo.length, 3);
});

test("comoJsonPlano lo deja plano de arriba abajo", () => {
    const plano = comoJsonPlano(comoLoDaElEditor());
    assert.equal(elPrimeroSinPrototipo(plano), null);
});

test("y no cambia el contenido: lo que se guarda es lo mismo", () => {
    const crudo = comoLoDaElEditor();
    const plano = comoJsonPlano(crudo);
    assert.deepEqual(JSON.parse(JSON.stringify(crudo)), plano);
    assert.equal(plano.content[0].attrs.level, 1);
    assert.equal(plano.content[1].content[1].attrs.etiqueta, "Acme");
});

test("un documento que ya era plano sale igual", () => {
    const plano = { type: "doc", content: [{ type: "paragraph" }] };
    assert.deepEqual(comoJsonPlano(plano), plano);
});

test("`undefined` se devuelve tal cual, no revienta", () => {
    // `JSON.stringify(undefined)` no es una cadena y `JSON.parse` de eso lanza.
    assert.equal(comoJsonPlano(undefined), undefined);
});

test("`null` y los tipos sueltos pasan", () => {
    assert.equal(comoJsonPlano(null), null);
    assert.equal(comoJsonPlano("hola"), "hola");
    assert.equal(comoJsonPlano(7), 7);
    assert.deepEqual(comoJsonPlano([1, 2]), [1, 2]);
});

test("una lista de nodos —no un doc— tambien se aplana", () => {
    // El editor devuelve un `doc`, pero el nodo de mencion se inserta como
    // fragmento suelto: si algun dia eso cruza, va por la misma funcion.
    const trozo = [{ type: "paragraph", attrs: attrs({ textAlign: "center" }) }];
    assert.equal(elPrimeroSinPrototipo(trozo), "$[0].attrs");
    assert.equal(elPrimeroSinPrototipo(comoJsonPlano(trozo)), null);
});
