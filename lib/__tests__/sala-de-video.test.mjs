/**
 * El banco de las salas de video.
 *
 * Lo que se prueba aquí es lo que **no se puede ver mirando la pantalla**: si
 * la malla se monta bien hay imagen, y si se monta mal también hay imagen —
 * solo que de tres de los cuatro, o de ninguno, o con dos ofertas chocando que
 * a veces cuadran y a veces no. Ese «a veces» es exactamente lo que un banco
 * puede cazar y una prueba a mano no.
 *
 * Y la otra mitad: lo que llega de FUERA. Esta es la primera función de la App
 * en la que alguien **sin cuenta** manda datos, así que el nombre, el SDP y la
 * caducidad tienen su casilla aquí.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc -p lib/__tests__/tsconfig.banco.json
 *
 * Ese `tsconfig` emite con la carpeta dentro (`.compilado/lib/...`), no plano.
 * Este fichero importaba la forma plana y por eso **no se podia ejecutar**: sin
 * esta linea nadie sabia con que comando se compilaba, y un banco que no
 * arranca se parece mucho a un banco que pasa.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    CADA_CUANTO_EN_LA_PUERTA_MS,
    CADA_CUANTO_EN_LA_SALA_MS,
    DURACIONES,
    DURACION_POR_DEFECTO,
    MARGEN_EN_LA_SALA_MS,
    TOPE_DEL_SDP,
    TOPE_DE_LA_SALA,
    comoEstaLaSala,
    comoQuedaLaMalla,
    comoSeGuardaElNombre,
    comoSeGuardaElSdp,
    cuandoCaduca,
    debeOfrecer,
    esTipoDeSenal,
    laDireccionDeLaSala,
    laRejilla,
    lasIniciales,
    loQueSeLeDiceAlQueLlegaTarde,
    sigueDentro,
} from "./.compilado/lib/sala-de-video.js";
import { laConexionEsDeOtraSesion } from "./.compilado/lib/reconexion-de-la-sala.js";

// ── Quién ofrece: la pregunta entera de una malla ───────────────────────────

test("de una pareja ofrece EXACTAMENTE uno", () => {
    // Si ofrecen los dos, las dos ofertas chocan y no se conecta; si no ofrece
    // ninguno, tampoco. Es la única regla que no puede fallar ni una vez.
    assert.equal(debeOfrecer("a", "b"), true);
    assert.equal(debeOfrecer("b", "a"), false);
});

test("nadie se ofrece a sí mismo, ni con ids vacíos", () => {
    assert.equal(debeOfrecer("a", "a"), false);
    assert.equal(debeOfrecer("", "a"), false);
    assert.equal(debeOfrecer("a", ""), false);
});

test("con CUATRO personas salen SEIS conexiones, y una oferta por pareja", () => {
    // La prueba que de verdad protege esto: se simula la sala entera y se
    // cuenta. Seis es `n(n-1)/2`, y cada pareja tiene que tener exactamente un
    // ofertante — ni dos (choque) ni cero (silencio).
    const todos = ["p3", "p1", "p4", "p2"]; // a propósito desordenados
    const ofertas = [];
    for (const yo of todos) {
        const { abrir } = comoQuedaLaMalla({ yo, dentro: todos, montadas: [] });
        assert.equal(abrir.length, todos.length - 1, `${yo} tiene que ver a los otros tres`);
        for (const otro of abrir) {
            if (debeOfrecer(yo, otro)) ofertas.push([yo, otro].join("→"));
        }
    }
    assert.equal(ofertas.length, 6, `una por pareja: ${ofertas.join(", ")}`);
    assert.equal(new Set(ofertas).size, 6, "y ninguna repetida");
});

test("el orden en que cada uno descubre al resto NO cambia quién ofrece", () => {
    // Es el motivo de que la regla sea comparar ids y no la hora de llegada:
    // dos personas que entran en la misma vuelta se descubren cada una en su
    // ciclo, y con «ofrece el que llegó antes» las dos podrían creerse la
    // segunda.
    const desdeA = comoQuedaLaMalla({ yo: "a", dentro: ["a", "b"], montadas: [] });
    const desdeB = comoQuedaLaMalla({ yo: "b", dentro: ["b", "a"], montadas: [] });
    assert.deepEqual(desdeA.abrir, ["b"]);
    assert.deepEqual(desdeB.abrir, ["a"]);
    assert.equal(debeOfrecer("a", "b") && !debeOfrecer("b", "a"), true);
});

// ── La malla: abrir lo que falta y CERRAR lo que sobra ──────────────────────

test("quien se va deja de estar en la malla", () => {
    const { abrir, cerrar } = comoQuedaLaMalla({
        yo: "yo",
        dentro: ["yo", "a"],
        montadas: ["a", "b"],
    });
    assert.deepEqual(abrir, []);
    assert.deepEqual(cerrar, ["b"], "sin esto, su recuadro negro se queda para siempre");
});

test("uno mismo nunca entra en la malla", () => {
    const { abrir } = comoQuedaLaMalla({ yo: "yo", dentro: ["yo"], montadas: [] });
    assert.deepEqual(abrir, [], "una conexión contra uno mismo es un bucle de audio");
});

test("los repetidos no abren dos conexiones con la misma persona", () => {
    const { abrir } = comoQuedaLaMalla({
        yo: "yo",
        dentro: ["yo", "a", "a", "a"],
        montadas: [],
    });
    assert.deepEqual(abrir, ["a"]);
});

test("una conexión ya montada no se vuelve a abrir", () => {
    // Sin esto, cada vuelta del reloj tiraría la conexión y la volvería a
    // negociar: la reunión se vería cortarse cada dos segundos.
    const { abrir, cerrar } = comoQuedaLaMalla({
        yo: "yo",
        dentro: ["yo", "a", "b"],
        montadas: ["a"],
    });
    assert.deepEqual(abrir, ["b"]);
    assert.deepEqual(cerrar, []);
});

// ── El enlace: caduca siempre, y revocada manda ─────────────────────────────

test("revocada manda sobre caducada", () => {
    // Son dos cosas que decir distintas: una se arregla pidiendo otro enlace y
    // la otra fue una decisión que alguien tomó.
    const sala = {
        expiraEn: new Date(Date.now() - 1000),
        revocadaEn: new Date(Date.now() - 1000),
    };
    assert.equal(comoEstaLaSala(sala), "revocada");
    assert.match(loQueSeLeDiceAlQueLlegaTarde("revocada"), /ya no está activo/);
    assert.match(loQueSeLeDiceAlQueLlegaTarde("caducada"), /caducado/);
});

test("una sala viva está abierta; una pasada, caducada", () => {
    assert.equal(
        comoEstaLaSala({ expiraEn: new Date(Date.now() + 60_000), revocadaEn: null }),
        "abierta",
    );
    assert.equal(
        comoEstaLaSala({ expiraEn: new Date(Date.now() - 1), revocadaEn: null }),
        "caducada",
    );
});

test("una duración inventada cae en la de por defecto, NUNCA en el infinito", () => {
    // Equivocarse hacia un día de más es un enlace que hay que revocar a mano;
    // equivocarse hacia el infinito es un enlace que nadie sabe que sigue
    // abierto.
    const ahora = Date.parse("2026-09-19T00:00:00.000Z");
    const porDefecto = DURACIONES.find((d) => d.valor === DURACION_POR_DEFECTO);
    for (const malo of [null, undefined, "", "1 año", 999, {}]) {
        const cuando = cuandoCaduca(malo, ahora);
        assert.equal(
            cuando.getTime(),
            ahora + porDefecto.horas * 3600_000,
            `no puede pasar: ${String(malo)}`,
        );
    }
});

test("cada duración de la lista da su hora, y la que no caduca da null", () => {
    const ahora = Date.parse("2026-09-19T00:00:00.000Z");
    for (const d of DURACIONES) {
        const cuando = cuandoCaduca(d.valor, ahora);
        if (d.horas === null) {
            // «No caduca» es `null` a propósito, y NO una fecha a cien años: un
            // centinela acaba impreso, que es la familia del «999999999 de -1
            // créditos». Si algún día esto vuelve a devolver una fecha para
            // esta duración, este caso es el que lo dice.
            assert.equal(cuando, null, `${d.valor} no puede tener fecha`);
            continue;
        }
        assert.ok(cuando instanceof Date, `${d.valor} tiene que dar una fecha`);
        assert.equal(cuando.getTime(), ahora + d.horas * 3600_000);
    }
});

// ── Presencia dentro de la sala ─────────────────────────────────────────────

test("sin latido NO se sigue dentro, y ese es el lado seguro", () => {
    assert.equal(sigueDentro(null), false);
    assert.equal(sigueDentro(undefined), false);
    assert.equal(sigueDentro("no es una fecha"), false);
});

test("el margen aguanta varias vueltas, no una", () => {
    const ahora = Date.now();
    // Una vuelta perdida no puede sacar a nadie: en una malla, sacar a alguien
    // además le CIERRA las conexiones con todos los demás.
    assert.equal(sigueDentro(new Date(ahora - CADA_CUANTO_EN_LA_SALA_MS * 2), ahora), true);
    assert.equal(sigueDentro(new Date(ahora - MARGEN_EN_LA_SALA_MS - 1000), ahora), false);
});

test("quien espera pregunta más despacio que quien está dentro", () => {
    assert.ok(
        CADA_CUANTO_EN_LA_PUERTA_MS > CADA_CUANTO_EN_LA_SALA_MS,
        "una pestaña olvidada en la puerta no puede costar lo mismo que una reunión",
    );
});

// ── Lo que llega de FUERA ───────────────────────────────────────────────────

test("el nombre de un invitado se limpia, se acorta y nunca queda vacío", () => {
    assert.equal(comoSeGuardaElNombre("  Ana   María  "), "Ana María");
    assert.equal(comoSeGuardaElNombre("Ana\nMaría"), "Ana María", "sin saltos de línea");
    assert.equal(comoSeGuardaElNombre("x".repeat(200)).length, 40);
    for (const malo of ["", "   ", "\n\n", null, 7, {}]) {
        assert.equal(comoSeGuardaElNombre(malo), null, `no vale: ${String(malo)}`);
    }
});

test("un SDP solo pasa si tiene la forma que mandamos", () => {
    const oferta = JSON.stringify({ type: "offer", sdp: "v=0\r\n..." });
    const respuesta = JSON.stringify({ type: "answer", sdp: "v=0\r\n..." });
    assert.equal(comoSeGuardaElSdp(oferta, "oferta"), oferta);
    assert.equal(comoSeGuardaElSdp(respuesta, "respuesta"), respuesta);
});

test("una respuesta no puede colarse como oferta, ni al revés", () => {
    // Aplicar una respuesta donde se espera una oferta deja la conexión en un
    // estado del que no sale, y sin error que mirar.
    const oferta = JSON.stringify({ type: "offer", sdp: "v=0" });
    assert.equal(comoSeGuardaElSdp(oferta, "respuesta"), null);
});

test("lo que no es el objeto que mandamos NO se guarda", () => {
    for (const malo of [
        "no es json",
        JSON.stringify({ type: "offer" }),
        JSON.stringify({ type: "offer", sdp: "" }),
        JSON.stringify({ sdp: "v=0" }),
        JSON.stringify("solo un texto"),
        JSON.stringify(null),
        JSON.stringify([1, 2]),
        "",
        null,
        42,
    ]) {
        assert.equal(comoSeGuardaElSdp(malo, "oferta"), null, `no vale: ${String(malo)}`);
    }
});

test("un SDP enorme se rechaza: eso no es una llamada de dos pistas", () => {
    const enorme = JSON.stringify({ type: "offer", sdp: "v".repeat(TOPE_DEL_SDP) });
    assert.equal(comoSeGuardaElSdp(enorme, "oferta"), null);
});

test("los tipos de señal son dos, y solo dos", () => {
    assert.equal(esTipoDeSenal("oferta"), true);
    assert.equal(esTipoDeSenal("respuesta"), true);
    for (const malo of ["candidato", "", null, 1, "OFERTA"]) {
        assert.equal(esTipoDeSenal(malo), false, `no vale: ${String(malo)}`);
    }
});

// ── La rejilla y el enlace ──────────────────────────────────────────────────

test("con cuatro NUNCA hay una sola columna", () => {
    // Con una columna, los dos últimos quedan fuera de la pantalla y no hay
    // forma de verlos: es lo único de la rejilla que se puede equivocar de
    // verdad, y por eso es puro.
    for (let n = 3; n <= TOPE_DE_LA_SALA; n++) {
        assert.match(laRejilla(n), /grid-cols-2/, `con ${n} hacen falta dos columnas`);
    }
});

test("la rejilla declara FILAS, no solo columnas", () => {
    // Lo que costó una medida en Chromium: sin filas declaradas, cada recuadro
    // se quedaba en `aspect-video` y con cuatro a 1440×900 las dos filas sumaban
    // 792 px, más de lo que hay entre la cabecera y los mandos. Los dos de abajo
    // caían por debajo de la barra de botones.
    for (let n = 1; n <= TOPE_DE_LA_SALA; n++) {
        assert.match(laRejilla(n), /grid-rows-/, `con ${n} falta declarar las filas`);
    }
});

test("con dos, una columna en vertical y dos en cuanto hay sitio", () => {
    assert.equal(laRejilla(1), "grid-cols-1 grid-rows-1");
    assert.equal(laRejilla(2), "grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1");
});

test("las iniciales salen de una o de dos palabras, y nunca vacías", () => {
    assert.equal(lasIniciales("Ana María Pérez"), "AP");
    assert.equal(lasIniciales("Ana"), "A");
    assert.equal(lasIniciales("  "), "?");
    assert.equal(lasIniciales(""), "?");
});

test("la dirección de una sala se escribe en un solo sitio", () => {
    assert.equal(
        laDireccionDeLaSala("ABC123", "https://ia-app.com"),
        "https://ia-app.com/reunion/ABC123",
    );
    // Con barra de sobra al final no salen dos.
    assert.equal(
        laDireccionDeLaSala("ABC123", "https://ia-app.com/"),
        "https://ia-app.com/reunion/ABC123",
    );
    // Y sin raíz sigue siendo una ruta válida dentro del mismo dominio.
    assert.equal(laDireccionDeLaSala("ABC123", null), "/reunion/ABC123");
});

// ── Rehacer una conexión: SELLO contra sello, nunca contra el reloj local ────
//
// Cuando a alguien se le cae la red y vuelve, hay que tirar la conexión vieja y
// montar otra. Antes eso se decidía restando el sello de entrada de la otra
// persona —hora del SERVIDOR— de la hora a la que YO monté la conexión —hora
// del NAVEGADOR—. Dos relojes: con el del servidor por delante del mío, la
// resta dice «entró después» aunque sea mentira, y la conexión se rehace en
// CADA vuelta —churn, «Conectando…» para siempre—. La corrección es comparar
// sello contra sello: solo se rehace si el `desde` cambió de verdad.
//
// El banco reproduce el modo roto —la resta cruzando relojes— al lado del nuevo,
// para que lo verde signifique que se arregló la causa y no que el caso no se
// ejercía.

/** El modo ROTO: lo que hacía antes, restando dos relojes distintos. */
function viejaPorReloj({ desdeServidor, montadaEnCliente }) {
    const entroEn = desdeServidor ? Date.parse(desdeServidor) : NaN;
    return Number.isFinite(entroEn) && entroEn > montadaEnCliente;
}

test("con el reloj del SERVIDOR adelantado, el modo viejo churnea y el nuevo no", () => {
    // La persona entró en un instante real T. El servidor va 30 s por delante
    // del navegador de quien monta la conexión (una hora mal puesta, que las
    // hay). Causalmente: se monta la conexión DESPUÉS de que la persona entró.
    const desdeServidor = "2026-09-21T00:00:30.000Z"; // T + 30 s (reloj servidor)
    // El navegador monta ~1 s después de la entrada real, pero su reloj va 30 s
    // atrasado respecto al servidor: T_real+1s en el reloj del navegador.
    const montadaEnCliente = Date.parse("2026-09-21T00:00:01.000Z");

    // MODO ROTO: 00:00:30 > 00:00:01 → true → se rehace SIN motivo, cada vuelta.
    assert.equal(
        viejaPorReloj({ desdeServidor, montadaEnCliente }),
        true,
        "el modo viejo, cruzando relojes, se rehace sola con solo skew de reloj",
    );

    // MODO NUEVO: el `desde` no cambió respecto al que se adoptó → NO se rehace.
    assert.equal(
        laConexionEsDeOtraSesion({
            desdeAhora: desdeServidor,
            desdeAlAdoptar: desdeServidor,
        }),
        false,
        "sello contra sello: mismo `desde` no es una re-entrada, haya el skew que haya",
    );
});

test("se rehace SOLO cuando el `desde` cambió de verdad (re-entrada real)", () => {
    const antes = "2026-09-21T00:00:00.000Z";
    const despues = "2026-09-21T00:05:00.000Z"; // la persona se cayó y volvió
    assert.equal(
        laConexionEsDeOtraSesion({ desdeAhora: despues, desdeAlAdoptar: antes }),
        true,
        "un `desde` nuevo es una sesión nueva: la conexión vieja hay que tirarla",
    );
    assert.equal(
        laConexionEsDeOtraSesion({ desdeAhora: antes, desdeAlAdoptar: antes }),
        false,
        "el mismo `desde` no toca nada",
    );
});

test("un `desde` que falta no decide nada: se ve de menos, no de más", () => {
    // Sin sello no se rehace: mejor una conexión de más viva que una buena
    // tirada en cada vuelta por un dato ausente.
    assert.equal(
        laConexionEsDeOtraSesion({ desdeAhora: null, desdeAlAdoptar: "2026-09-21T00:00:00.000Z" }),
        false,
    );
    assert.equal(
        laConexionEsDeOtraSesion({ desdeAhora: "2026-09-21T00:00:00.000Z", desdeAlAdoptar: undefined }),
        false,
    );
    assert.equal(laConexionEsDeOtraSesion({ desdeAhora: null, desdeAlAdoptar: null }), false);
});
