/**
 * El banco PURO de exportar un documento y de los fijados.
 *
 * No necesita base ni navegador: entra un árbol de tiptap y sale texto. Corre
 * con `node --test lib/__tests__/exportar-documento.test.mjs` sobre el
 * compilado de `scripts/banco-documentos.sh`.
 *
 * Lo que de verdad protege son **los dos casos que la versión de Notas no
 * sabía hacer** —una mención y una lista—, porque los dos desaparecían del
 * fichero sin decir nada: un `.md` que dice menos que el documento del que
 * salió es peor que uno feo.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    comoMarkdown,
    comoTextoPlano,
    cuerpoComoTexto,
    filasComoTabla,
    nombreDeArchivo,
} from "./.compilado/documentos/exportar-documento.js";
import { conLosFijadosArriba } from "./.compilado/documentos/documentacion.js";

const doc = (...hijos) => ({ type: "doc", content: hijos });
const parrafo = (...hijos) => ({ type: "paragraph", content: hijos });
const texto = (t, ...marcas) => ({
    type: "text",
    text: t,
    marks: marcas.map((type) => ({ type })),
});

/* ──────────────────────────────── El cuerpo ─────────────────────────────── */

test("las marcas salen en el .md y NO en el .txt", () => {
    const contenido = doc(parrafo(texto("hola ", "bold"), texto("mundo", "italic")));
    // Dos nodos de texto seguidos, cada uno con su marca: `**hola **` y
    // `*mundo*`, pegados. No se fusionan ni se ordenan las marcas — el editor
    // ya escribe el árbol así.
    assert.equal(cuerpoComoTexto(contenido, true), "**hola ***mundo*");
    assert.equal(cuerpoComoTexto(contenido, false), "hola mundo");
});

test("una MENCIÓN sale con su etiqueta, no como un hueco", () => {
    // Es el caso que la versión de Notas perdía: el nodo es un átomo, así que
    // `node.content` está vacío y sin esta rama la mención desaparecía del
    // fichero exportado — el documento diría una cosa y su copia otra.
    const contenido = doc(
        parrafo(
            texto("Hablado con "),
            { type: "mencion", attrs: { tipo: "cliente", refId: "c1", etiqueta: "Acme SAS" } },
            texto(" ayer"),
        ),
    );
    assert.equal(cuerpoComoTexto(contenido, true), "Hablado con Acme SAS ayer");
});

test("sin etiqueta guardada queda el id, que al menos dice que ahí había algo", () => {
    const contenido = doc(parrafo({ type: "mencion", attrs: { refId: "c9" } }));
    assert.equal(cuerpoComoTexto(contenido, true), "c9");
});

test("encabezados, listas y tareas", () => {
    const contenido = doc(
        { type: "heading", attrs: { level: 2 }, content: [texto("Pasos")] },
        {
            type: "bulletList",
            content: [{ type: "listItem", content: [parrafo(texto("uno"))] }],
        },
        {
            type: "taskList",
            content: [
                { type: "taskItem", attrs: { checked: true }, content: [parrafo(texto("hecho"))] },
            ],
        },
    );
    assert.equal(cuerpoComoTexto(contenido, true), "## Pasos\n\n- uno\n\n- [x] hecho");
    // En plano no hay almohadillas —eso es marcado y el título se lee igual—
    // pero los guiones de la lista SE QUEDAN: sin ellos, cinco puntos seguidos
    // se leen como un párrafo y no como una lista.
    assert.equal(cuerpoComoTexto(contenido, false), "Pasos\n\n- uno\n\n- [x] hecho");
});

test("un contenido que no es un árbol no revienta: sale vacío", () => {
    for (const malo of [null, undefined, 42, "texto", {}, { content: "no es lista" }]) {
        assert.equal(cuerpoComoTexto(malo, true), "");
    }
});

test("un árbol MUY hondo termina, y no se come la pila", () => {
    // El contenido llega del navegador, así que su hondura no es de fiar. Este
    // caso cazó la primera versión, que era RECURSIVA: se caía con
    // «Maximum call stack size exceeded», o sea la pestaña de quien pulsa
    // «Exportar» reventada sin ninguna explicación.
    let nodo = parrafo(texto("fondo"));
    for (let i = 0; i < 20000; i++) nodo = { type: "blockquote", content: [nodo] };
    let salida = "";
    assert.doesNotThrow(() => {
        salida = cuerpoComoTexto(doc(nodo), true);
    });
    assert.match(salida, /fondo/, "y llega hasta el fondo, no se rinde a medias");
});

/* ──────────────────────────── Una lista, en tabla ───────────────────────── */

test("las filas de una lista salen como tabla, con la fecha sin hora", () => {
    const tabla = filasComoTabla([
        {
            titulo: "Llamar",
            estado: "Pendiente",
            fecha: new Date("2026-03-04T15:00:00Z"),
            asignadoNombre: "Yair",
            notas: null,
        },
    ]);
    assert.match(tabla, /\| Título \| Estado \| Fecha \| Asignado \| Notas \|/);
    assert.match(tabla, /\| Llamar \| Pendiente \| 2026-03-04 \| Yair \|  \|/);
});

test("una barra o un salto dentro de una celda no parten la tabla", () => {
    const tabla = filasComoTabla([
        { titulo: "a|b", estado: "x", notas: "dos\nlíneas", asignadoNombre: null },
    ]);
    const filas = tabla.split("\n");
    assert.equal(filas.length, 3, "cabecera, separador y UNA fila");
    assert.match(filas[2], /a\\\|b/);
    assert.match(filas[2], /dos líneas/);
});

test("sin filas no se escribe ninguna tabla", () => {
    assert.equal(filasComoTabla([]), "");
    assert.equal(comoMarkdown({ titulo: "Vacío", filas: [] }), "# Vacío\n");
});

test("un documento de tipo LISTA exporta sus filas, que es todo lo que tiene", () => {
    // Su `contenido` está vacío a propósito: lo que dice una lista son sus
    // filas. Exportando solo el cuerpo saldría un fichero en blanco.
    const md = comoMarkdown({
        titulo: "Tareas",
        contenido: doc(),
        filas: [{ titulo: "Una", estado: "Hecho" }],
    });
    assert.match(md, /^# Tareas/);
    assert.match(md, /\| Una \| Hecho \|/);
});

/* ─────────────────────────── El nombre del fichero ──────────────────────── */

test("el nombre del fichero se limpia, se topa y NUNCA queda vacío", () => {
    assert.equal(nombreDeArchivo("Cómo se instala", "md"), "como-se-instala.md");
    assert.equal(nombreDeArchivo("🙂🙂🙂", "txt"), "documento.txt");
    assert.equal(nombreDeArchivo("  ", "md"), "documento.md");
    assert.ok(nombreDeArchivo("a".repeat(500), "md").length <= 83);
});

test("el título va DENTRO del fichero, no solo en su nombre", () => {
    const doc1 = { titulo: "Manual", contenido: doc(parrafo(texto("cuerpo"))) };
    assert.equal(comoMarkdown(doc1), "# Manual\n\ncuerpo\n");
    assert.equal(comoTextoPlano(doc1), "Manual\n\ncuerpo\n");
});

/* ───────────────────────────── Los fijados ──────────────────────────────── */

test("los fijados van delante, sin tocar el orden de dentro de cada grupo", () => {
    const lista = [
        { id: "a" },
        { id: "b", fijado: true },
        { id: "c" },
        { id: "d", fijado: true },
    ];
    assert.deepEqual(
        conLosFijadosArriba(lista).map((d) => d.id),
        ["b", "d", "a", "c"],
    );
});

test("sin ninguno fijado devuelve la MISMA lista, sin copiarla", () => {
    // No es una microoptimización: es lo que hace que esto no cambie ni un
    // árbol mientras nadie fije nada.
    const lista = [{ id: "a" }, { id: "b" }];
    assert.equal(conLosFijadosArriba(lista), lista);
});
