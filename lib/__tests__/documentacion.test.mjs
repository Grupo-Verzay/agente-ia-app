/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Lo que se puede mencionar se tiene que poder ENCONTRAR.**
 *
 * De donde sale: la mencion y el buscador parecen dos funciones y son una. Se
 * menciona a un cliente dentro de un procedimiento; meses despues alguien
 * teclea el nombre de ese cliente en el buscador. Si la etiqueta de la mencion
 * no entra en el texto que indexa el GIN, ese documento **no sale**, y no hay
 * ningun error que mirar: el buscador contesta «sin resultados» con toda
 * normalidad y el documento sigue ahi. Es la familia de fallo mudo de la que
 * va medio CLAUDE.md.
 *
 * Aqui corren las funciones REALES de `lib/documentacion.ts`, que es puro.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 * ver la cabecera de `salud-del-envio.test.mjs` — el mismo procedimiento, con
 * `lib/documentacion.ts` en la lista de ficheros.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
    leerElContenido,
    loQueCabeEnElCalendario,
    repartirEnColumnas,
    comoEstados,
    comoTitulo,
    comoId,
    comoVista,
    comoTipoDeMencion,
    extractoConLoBuscado,
    laArrobaQueSeEscribe,
    loQueOfreceElSelector,
    documentoVacio,
    TOPE_DEL_TEXTO_INDEXADO,
    TOPE_DE_MENCIONES,
    ESTADOS_POR_DEFECTO,
} = await import("./.compilado/documentacion.js");

const parrafo = (...hijos) => ({ type: "paragraph", content: hijos });
const texto = (t) => ({ type: "text", text: t });
const mencion = (tipo, refId, etiqueta) => ({
    type: "mencion",
    attrs: { tipo, refId, etiqueta },
});
const doc = (...hijos) => ({ type: "doc", content: hijos });

/* ── Aplanar el contenido ─────────────────────────────────────────────────── */

test("el texto sale en el ORDEN en que esta escrito", () => {
    // La pila se vacia por el final, asi que los hijos se empujan al reves. Si
    // eso se rompe, el texto sale invertido: el indice sigue funcionando —las
    // palabras son las mismas— y el EXTRACTO de la busqueda sale del reves, que
    // es un fallo que nadie relaciona con esta funcion.
    const { texto: plano } = leerElContenido(
        doc(parrafo(texto("uno")), parrafo(texto("dos")), parrafo(texto("tres"))),
    );
    assert.equal(plano.replace(/\s+/g, " ").trim(), "uno dos tres");
});

test("dos parrafos no se PEGAN en una palabra inventada", () => {
    // Sin el salto entre bloques, «del cliente» y «El siguiente» darian
    // «clienteEl», una palabra que no existe y que no encuentra nadie.
    const { texto: plano } = leerElContenido(
        doc(parrafo(texto("del cliente")), parrafo(texto("El siguiente paso"))),
    );
    assert.ok(!plano.includes("clienteEl"), plano);
    assert.match(plano, /cliente\s+El siguiente/);
});

test("la ETIQUETA de una mencion entra en el texto que se indexa", () => {
    // El invariante de la cabecera. Sin esto, buscar «Distribuidora Pardo» no
    // encuentra el procedimiento que la menciona.
    const { texto: plano, menciones } = leerElContenido(
        doc(parrafo(texto("Responsable: "), mencion("cliente", "c1", "Distribuidora Pardo"))),
    );
    assert.match(plano, /Distribuidora Pardo/);
    assert.equal(menciones.length, 1);
    assert.deepEqual(menciones[0], {
        tipo: "cliente",
        refId: "c1",
        etiqueta: "Distribuidora Pardo",
    });
});

test("la misma cosa mencionada dos veces es UNA mencion", () => {
    const { menciones } = leerElContenido(
        doc(
            parrafo(mencion("cliente", "c1", "Pardo")),
            parrafo(mencion("cliente", "c1", "Pardo")),
            parrafo(mencion("tarea", "c1", "Otra cosa con el mismo id")),
        ),
    );
    // Dedupe por (tipo, refId), no por refId a secas: una tarea y un cliente
    // pueden compartir id y son dos cosas.
    assert.equal(menciones.length, 2);
    assert.deepEqual(
        menciones.map((m) => `${m.tipo}:${m.refId}`),
        ["cliente:c1", "tarea:c1"],
    );
});

test("una mencion a medias se descarta, no se guarda rota", () => {
    const { menciones } = leerElContenido(
        doc(
            parrafo({ type: "mencion", attrs: { tipo: "cliente" } }),
            parrafo({ type: "mencion", attrs: { tipo: "inventado", refId: "x" } }),
            parrafo({ type: "mencion", attrs: { tipo: "ticket", refId: 7 } }),
            parrafo(mencion("ticket", "t1", "")),
        ),
    );
    // Sin refId, con un tipo que no existe, y con un refId que no es cadena
    // —`String(7)` pasaria un filtro que solo mirase el largo—. Queda una.
    assert.equal(menciones.length, 1);
    assert.equal(menciones[0].refId, "t1");
    // Sin etiqueta se usa el id: feo pero cierto. Vacia pintaria una pastilla
    // en blanco dentro del texto.
    assert.equal(menciones[0].etiqueta, "t1");
});

test("un contenido MUY hondo no revienta la pila: llega hasta el fondo", () => {
    // Llega del navegador, asi que su forma no es de fiar. Con un recorrido
    // RECURSIVO esto es un desbordamiento de pila y un 500 sin explicacion;
    // con el iterativo termina y encuentra el texto del fondo. Que NO se quede
    // corto es parte de lo que se comprueba: 60.000 de hondo estan muy por
    // debajo del presupuesto, asi que aqui no hay nada que recortar.
    let hondo = { type: "paragraph", content: [texto("fondo")] };
    for (let i = 0; i < 60_000; i++) hondo = { type: "blockquote", content: [hondo] };

    const salida = leerElContenido(doc(hondo));
    assert.match(salida.texto, /fondo/);
    assert.equal(salida.seQuedoCorto, false);
});

test("y un contenido ENORME se rinde y lo dice", () => {
    // El presupuesto es lo otro: no protege de la hondura, protege de que un
    // documento fabricado tenga al servidor recorriendo nodos un rato largo.
    // Y cuando se agota **se dice**: un texto indexado a medias sin avisar
    // seria un documento que se encuentra solo por su primera mitad.
    // El arreglo se construye a mano y NO con `doc(...muchos)`: expandir
    // 150.000 argumentos en una llamada desborda la pila del propio banco, que
    // es un fallo del banco y no de lo que se prueba.
    const muchos = [];
    for (let i = 0; i < 150_000; i++) muchos.push(parrafo(texto(`p${i}`)));
    const salida = leerElContenido({ type: "doc", content: muchos });
    assert.equal(salida.seQuedoCorto, true);
});

test("el texto se RECORTA al tope, y se dice", () => {
    // No es comodidad: un `tsvector` de Postgres no puede pasar de 1 MB y da
    // error, asi que sin el tope el documento no se podria GUARDAR.
    const largo = "palabra ".repeat(30_000);
    const { texto: plano, textoRecortado } = leerElContenido(doc(parrafo(texto(largo))));
    assert.ok(plano.length <= TOPE_DEL_TEXTO_INDEXADO, String(plano.length));
    assert.equal(textoRecortado, true);
});

test("un documento normal NO dice que se recorto", () => {
    const { textoRecortado, seQuedoCorto } = leerElContenido(
        doc(parrafo(texto("Procedimiento de alta"))),
    );
    assert.equal(textoRecortado, false);
    assert.equal(seQuedoCorto, false);
});

test("un contenido basura no lanza", () => {
    for (const basura of [null, undefined, 7, "texto", [], {}, { type: "doc" }]) {
        const salida = leerElContenido(basura);
        assert.equal(typeof salida.texto, "string");
        assert.deepEqual(salida.menciones, []);
    }
});

test("el documento vacio es una copia NUEVA cada vez", () => {
    // Con una constante compartida, el contenido de un documento acabaria
    // dentro de otro — y eso solo se ve el dia que alguien crea dos seguidos.
    const a = documentoVacio();
    const b = documentoVacio();
    assert.notEqual(a, b);
    assert.notEqual(a.content, b.content);
});

/* ── Las tres vistas ──────────────────────────────────────────────────────── */

const fila = (id, estado, fecha) => ({
    id,
    documentoId: "d1",
    titulo: id,
    estado,
    fecha: fecha ? new Date(fecha) : null,
    asignadoId: null,
    asignadoNombre: null,
    notas: null,
    creadoEn: new Date("2026-09-01T00:00:00Z"),
});

test("el calendario dice CUANTAS filas deja fuera", () => {
    // Una fila sin fecha no cabe en un calendario, y eso no tiene vuelta. Lo
    // que no puede pasar es que desaparezca en silencio: con 60 filas y 20
    // fechas, el calendario enseña 20 y desde fuera se lee como que se
    // perdieron 40.
    const { conFecha, sinFecha } = loQueCabeEnElCalendario([
        fila("a", "Pendiente", "2026-09-10T10:00:00Z"),
        fila("b", "Pendiente", null),
        fila("c", "Hecho", "2026-09-12T10:00:00Z"),
        fila("d", "Hecho", null),
    ]);
    assert.equal(conFecha.length, 2);
    assert.equal(sinFecha, 2);
});

test("una fecha invalida cuenta como SIN fecha, no revienta el calendario", () => {
    const rota = fila("x", "Pendiente", null);
    rota.fecha = new Date("no es una fecha");
    const { conFecha, sinFecha } = loQueCabeEnElCalendario([rota]);
    assert.equal(conFecha.length, 0);
    assert.equal(sinFecha, 1);
});

test("el tablero NO pierde una fila con un estado que ya no existe", () => {
    // Alguien renombro la columna, o la fila viene de antes. Dejarla fuera
    // seria borrarla de la vista sin borrarla de la base: no esta y sigue
    // contando.
    const columnas = repartirEnColumnas(
        [fila("a", "Pendiente"), fila("b", "Columna borrada"), fila("c", "Hecho")],
        ["Pendiente", "Hecho"],
    );
    const total = columnas.reduce((n, c) => n + c.filas.length, 0);
    assert.equal(total, 3);
    assert.deepEqual(columnas[0].filas.map((f) => f.id), ["a", "b"]);
});

test("sin columnas, el tablero cae en las de por defecto", () => {
    const columnas = repartirEnColumnas([fila("a", "Pendiente")], []);
    assert.deepEqual(columnas.map((c) => c.estado), [...ESTADOS_POR_DEFECTO]);
});

test("los estados se sanean: vacios fuera, repetidos fuera, y nunca cero", () => {
    assert.deepEqual(comoEstados(["  Uno  ", "", "Uno", "Dos"]), ["Uno", "Dos"]);
    assert.deepEqual(comoEstados([]), [...ESTADOS_POR_DEFECTO]);
    assert.deepEqual(comoEstados("no es una lista"), [...ESTADOS_POR_DEFECTO]);
    assert.deepEqual(comoEstados([1, 2, null]), [...ESTADOS_POR_DEFECTO]);
});

/* ── Lo que llega de fuera ────────────────────────────────────────────────── */

test("el titulo APLASTA los saltos, no corta por el primero", () => {
    // Quien pega un texto de varias lineas quiere que se vea entero; cortar por
    // el primer Enter es tirar lo que acaba de escribir sin decirselo.
    assert.equal(comoTitulo("Alta de cliente\nPaso a paso"), "Alta de cliente Paso a paso");
    assert.equal(comoTitulo("   "), null);
    assert.equal(comoTitulo(7), null);
});

test("un id que no es CADENA no pasa", () => {
    assert.equal(comoId("d1"), "d1");
    assert.equal(comoId(7), null);
    assert.equal(comoId(""), null);
    assert.equal(comoVista("TABLA"), "tabla");
    assert.equal(comoVista("gantt"), null);
    assert.equal(comoTipoDeMencion("cliente"), "cliente");
    assert.equal(comoTipoDeMencion("factura"), null);
});

/* ── El extracto de la busqueda ───────────────────────────────────────────── */

test("el extracto sale ALREDEDOR de lo que se busco", () => {
    // Un resultado que siempre enseña el principio del documento no dice por
    // que ha salido, y con veinte resultados iguales la lista no ayuda.
    const largo = `${"relleno ".repeat(60)}el contrato de Pardo${" cola".repeat(60)}`;
    const extracto = extractoConLoBuscado(largo, "Pardo");
    assert.match(extracto, /Pardo/);
    assert.ok(extracto.startsWith("…"));
});

test("si no se encuentra el termino, el extracto cae al principio", () => {
    // Casa por la raiz —«facturas» contra «factura»— y aun asi hay que enseñar
    // algo: un hueco es peor.
    const extracto = extractoConLoBuscado("Procedimiento de facturas mensuales", "factura");
    assert.ok(extracto.startsWith("Procedimiento"), extracto);
});

/* ── La arroba del editor ─────────────────────────────────────────────────── */

test("la arroba tiene que ABRIR palabra", () => {
    // La MISMA condicion con la que el chat de equipo decide que
    // `hola@verzay.com` no es una mencion. Si las dos no estuvieran de acuerdo,
    // el selector ofreceria algo que luego no se guarda como mencion: el texto
    // sale, el retroenlace no aparece, y no hay ningun error que mirar.
    assert.deepEqual(laArrobaQueSeEscribe("hola @par", 9), { desde: 5, consulta: "par" });
    assert.equal(laArrobaQueSeEscribe("escribe a hola@verzay.com", 25), null);
    assert.deepEqual(laArrobaQueSeEscribe("@", 1), { desde: 0, consulta: "" });
});

test("un salto de linea CIERRA la arroba", () => {
    // Sin esto, la arroba de hace tres parrafos seguiria abierta y el selector
    // saltaria solo mientras se escribe cualquier cosa.
    assert.equal(laArrobaQueSeEscribe("@algo\ny sigo escribiendo", 22), null);
});

test("el selector encuentra SIN acentos", () => {
    // Quien teclea «atencion» tiene que encontrar «Verzay | Atención». Sin
    // esto el selector sale vacio y se lee como que eso no se puede mencionar.
    const ofrece = loQueOfreceElSelector(
        [{ etiqueta: "Verzay | Atención" }, { etiqueta: "Otra cosa" }],
        "atencion",
    );
    assert.equal(ofrece.length, 1);
    assert.equal(ofrece[0].etiqueta, "Verzay | Atención");
});

test("el tope de menciones no deja crecer una fila sin fin", () => {
    const muchas = [];
    for (let i = 0; i < TOPE_DE_MENCIONES + 50; i++) {
        muchas.push(parrafo(mencion("tarea", `t${i}`, `Tarea ${i}`)));
    }
    const { menciones } = leerElContenido(doc(...muchas));
    assert.equal(menciones.length, TOPE_DE_MENCIONES);
});
