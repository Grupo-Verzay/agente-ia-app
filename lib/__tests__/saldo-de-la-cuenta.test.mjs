/**
 * El banco de **«la llamada sale y la transcripción dice que quedan 0»**.
 *
 * El reporte: en CRM › Llamadas las llamadas se hacen bien y quedan con su
 * duración, y la transcripción falla con «No hay créditos suficientes: hacen
 * falta 14 y quedan 0» **sobre una cuenta que sí tiene créditos**. Sin
 * transcripción tampoco hay Resumen IA.
 *
 * La sospecha era que la transcripción miraba el saldo de OTRA cuenta —la
 * madre—. No era eso: la cadena entera va por la cuenta dueña de la línea (el
 * `sid` con el que se llama, la fila en la que se anota y la bolsa de la que
 * se cobra son la misma), y eso lo prueba el banco de Postgres de al lado. Lo
 * que fallaba es que **la App y el motor no contestaban lo mismo sobre la
 * MISMA cuenta**:
 *
 *   | | el motor (autoriza la LLAMADA) | la App (autoriza la TRANSCRIPCIÓN) |
 *   | --- | --- | --- |
 *   | `total < 0` | ilimitado | **0** |
 *   | sin fila de créditos | «no se encontraron» | **0** |
 *
 * Las dos producen exactamente el síntoma reportado.
 *
 * Cuatro bloques:
 *
 *   A. la REGLA, encadenada con la del motor escrita aquí literal;
 *   B. lo que se DECIDE con ese saldo, y lo que se le dice a una persona;
 *   C. el audio que no se puede cortar, que salía como «no respondió»;
 *   D. un BARRIDO: que las cuatro pantallas que transcriben vayan por la misma
 *      puerta, que es lo que un banco de funciones puras no puede afirmar.
 *
 * `MODO=roto` ejerce **el lector de antes** —escrito aquí literal— y afirma
 * el fallo: la cuenta ilimitada con «quedan 0» y la que no tiene bolsa
 * indistinguible de la que se quedó sin créditos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";

const {
    elSaldoDeLaFila,
    alcanzaPara,
    seCobra,
    loQueQueda,
    comoSeLeeElSaldo,
    TOKENS_POR_CREDITO,
    queHacerConLaGrabacion,
    porQueNoSeTranscribioLaGrabacion,
    elMotivoDeLaGrabacion,
    laMarcaDeLaLlamada,
    loQueSeEnsenaDeLaLlamada,
    valeLaPenaSeguirEsperando,
    TOPE_DE_TROZOS,
    TOPE_DE_BYTES_DE_AUDIO,
    queHacerConLaNota,
    costoDeLaNota,
    porQueNoSeTranscribio,
    sePuedeReintentar,
    trozosDeWav,
    cuantosTrozosDeVerdad,
    sePuedeCortar,
} = await import("./.compilado/saldo/entrada-del-saldo.js");

/* ── Lo de ANTES, escrito literal ───────────────────────────────────────── */

/**
 * El lector de la App tal como estaba: un `number | null` donde `null` era
 * «ilimitado» y **todo lo demás era un número**.
 *
 * Se escribe aquí y no se llama a la función de hoy a propósito: con la nueva,
 * el modo roto diría lo correcto y el caso que viene a reproducir no se
 * reproduciría.
 */
function elSaldoDeAntes(fila, pagaSuIa) {
    if (pagaSuIa) return null;
    if (!fila) return 0;
    return Math.max(0, fila.total - Math.floor(fila.used / TOKENS_POR_CREDITO));
}

/**
 * Y la regla del MOTOR (`AiCreditsService.getCreditsByUser` de `api-webhook`),
 * también literal. Es la referencia contra la que se encadena: las dos deciden
 * sobre la misma llamada, así que tienen que decir lo mismo.
 */
function loQueDiceElMotor(fila, pagaSuIa) {
    if (pagaSuIa) return { ok: true, ilimitado: true };
    if (!fila) return { ok: false };
    if (fila.total < 0) return { ok: true, ilimitado: true };
    const usados = Math.floor(fila.used / TOKENS_POR_CREDITO);
    return { ok: true, ilimitado: false, disponibles: Math.max(fila.total - usados, 0) };
}

/** Lo que el motor deja pasar: es lo que autoriza la llamada. */
function elMotorDejaLlamar(fila, pagaSuIa) {
    const r = loQueDiceElMotor(fila, pagaSuIa);
    if (!r.ok) return false;
    return r.ilimitado || r.disponibles > 0;
}

/* ── A. La regla ────────────────────────────────────────────────────────── */

test("A1 · quien paga su propia IA no tiene tope, aunque no tenga bolsa", () => {
    assert.deepEqual(elSaldoDeLaFila({ fila: null, pagaSuIa: true }), { estado: "ilimitado" });
    assert.deepEqual(
        elSaldoDeLaFila({ fila: { total: 0, used: 9e9 }, pagaSuIa: true }),
        { estado: "ilimitado" },
    );
});

test("A2 · SIN FILA no es «quedan cero»: es que no tiene bolsa", () => {
    const saldo = elSaldoDeLaFila({ fila: null, pagaSuIa: false });

    if (ROTO) {
        // Lo de antes: un cero indistinguible de «se te acabaron», que es lo
        // que mandaba a recargar una bolsa que nadie había asignado.
        assert.equal(elSaldoDeAntes(null, false), 0);
        return;
    }

    assert.deepEqual(saldo, { estado: "sin_bolsa" });
    assert.equal(loQueQueda(saldo), null, "no hay número que enseñar, y un 0 mentiría");
    assert.equal(seCobra(saldo), false, "no hay fila que descontar");
});

test("A3 · un TOTAL NEGATIVO es «sin tope», que es lo que ya decía el motor", () => {
    const fila = { total: -1, used: 4_000_000 };

    if (ROTO) {
        // **El fallo reportado, entero.** El motor deja hacer la llamada y la
        // App dice que quedan cero, sobre la misma cuenta y en el mismo minuto.
        assert.equal(elMotorDejaLlamar(fila, false), true, "el motor deja llamar");
        assert.equal(elSaldoDeAntes(fila, false), 0, "y la App decía que quedan 0");
        return;
    }

    assert.deepEqual(elSaldoDeLaFila({ fila, pagaSuIa: false }), { estado: "ilimitado" });
});

test("A4 · con bolsa, la resta de siempre y nunca por debajo de cero", () => {
    assert.deepEqual(
        elSaldoDeLaFila({ fila: { total: 12000, used: 25_802_940 }, pagaSuIa: false }),
        { estado: "quedan", creditos: 3636 },
    );
    // El caso medido en producción que ya está en CLAUDE.md: 25.802.940 tokens
    // son 8.364 créditos, y de 12.000 quedan 3.636.
    assert.deepEqual(
        elSaldoDeLaFila({ fila: { total: 10, used: 9e9 }, pagaSuIa: false }),
        { estado: "quedan", creditos: 0 },
        "gastar de más no deja un saldo negativo",
    );
});

/**
 * **El invariante, y es lo único que de verdad cierra esto.** No es que cada
 * caso esté bien por separado: es que las dos mitades de la plataforma tienen
 * que decir lo mismo de la misma fila. Si alguna vez vuelven a separarse,
 * vuelve el reporte — con otra cara y sin nada en la consola.
 */
test("A5 · lo que el MOTOR da por ilimitado, la App también", () => {
    if (ROTO) return;
    const filas = [
        null,
        { total: -1, used: 0 },
        { total: -1, used: 9e9 },
        { total: 0, used: 0 },
        { total: 1000, used: 0 },
        { total: 1000, used: 3_085_000 },
        { total: 1000, used: 9e9 },
    ];
    for (const fila of filas) {
        for (const pagaSuIa of [false, true]) {
            const motor = loQueDiceElMotor(fila, pagaSuIa);
            const app = elSaldoDeLaFila({ fila, pagaSuIa });

            assert.equal(
                app.estado === "ilimitado",
                motor.ok && motor.ilimitado === true,
                `no coinciden en «ilimitado» con ${JSON.stringify(fila)} pagaSuIa=${pagaSuIa}`,
            );
            assert.equal(
                app.estado === "sin_bolsa",
                !motor.ok,
                `no coinciden en «sin bolsa» con ${JSON.stringify(fila)} pagaSuIa=${pagaSuIa}`,
            );
            if (app.estado === "quedan") {
                assert.equal(app.creditos, motor.disponibles, "el número tiene que ser el mismo");
            }
        }
    }
});

/* ── B. Lo que se decide con ese saldo ──────────────────────────────────── */

const SEGUNDOS_DEL_REPORTE = 140; // 14 créditos, que es lo que decía la captura

test("B1 · la cuenta ilimitada por total negativo SÍ transcribe", () => {
    const fila = { total: -1, used: 4_000_000 };

    if (ROTO) {
        const que = laDecisionDeAntes(SEGUNDOS_DEL_REPORTE, elSaldoDeAntes(fila, false));
        assert.equal(que.hacer, "sin_creditos");
        assert.equal(que.disponibles, 0);
        assert.equal(que.costo.creditos, 14, "los 14 créditos exactos de la captura");
        return;
    }

    const que = queHacerConLaGrabacion({
        segundos: SEGUNDOS_DEL_REPORTE,
        bytes: 1024,
        trozos: 1,
        saldo: elSaldoDeLaFila({ fila, pagaSuIa: false }),
    });
    assert.equal(que.hacer, "transcribir");
});

test("B2 · «sin bolsa» es un motivo aparte, y no enseña un cero inventado", () => {
    if (ROTO) return;
    const que = queHacerConLaGrabacion({
        segundos: SEGUNDOS_DEL_REPORTE,
        bytes: 1024,
        trozos: 1,
        saldo: { estado: "sin_bolsa" },
    });
    assert.equal(que.hacer, "sin_bolsa");
    assert.equal(que.disponibles, null, "un 0 aquí se lee como «se te acabaron»");
    assert.equal(elMotivoDeLaGrabacion(que), "sin_bolsa");

    const agotada = queHacerConLaGrabacion({
        segundos: SEGUNDOS_DEL_REPORTE,
        bytes: 1024,
        trozos: 1,
        saldo: { estado: "quedan", creditos: 0 },
    });
    assert.equal(agotada.hacer, "sin_creditos");
    assert.notEqual(
        porQueNoSeTranscribioLaGrabacion(que),
        porQueNoSeTranscribioLaGrabacion(agotada),
        "dos arreglos distintos no pueden leerse igual",
    );
});

test("B3 · el aviso NOMBRA la cuenta que paga", () => {
    if (ROTO) return;
    const conNombre = porQueNoSeTranscribio("sin_creditos", {
        hacenFalta: 14,
        quedan: 0,
        cuenta: "Verzay | Ventas",
    });
    assert.ok(
        conNombre.includes("Verzay | Ventas"),
        "sin el nombre, quien lo lee mira la bolsa de la cuenta con la que entró",
    );
    assert.ok(conNombre.includes("14") && conNombre.includes("0"));

    // Y sin nombre sigue diciendo algo útil: las notas de voz no siempre lo
    // tienen a mano.
    assert.ok(porQueNoSeTranscribio("sin_creditos", { hacenFalta: 14 }).includes("14"));

    const sinBolsa = porQueNoSeTranscribio("sin_bolsa", { cuenta: "Verzay | Ventas" });
    assert.ok(sinBolsa.includes("Verzay | Ventas"));
    assert.ok(
        /asign/i.test(sinBolsa),
        "tiene que decir qué hacer, y lo que hay que hacer es asignarle un cupo",
    );
});

test("B4 · se puede reintentar, pero NO sondeando media hora", () => {
    if (ROTO) return;
    assert.equal(sePuedeReintentar("sin_bolsa"), true, "asignarle un cupo lo arregla");
    assert.equal(
        valeLaPenaSeguirEsperando("sin_bolsa"),
        false,
        "nadie asigna un cupo en los 30 minutos siguientes, y cada vuelta baja el WAV entero",
    );
    assert.equal(valeLaPenaSeguirEsperando("sin_creditos"), false);
    assert.equal(valeLaPenaSeguirEsperando("no_transcribio"), true);
});

test("B5 · solo se descuenta cuando hay bolsa de verdad", () => {
    if (ROTO) return;
    assert.equal(seCobra({ estado: "quedan", creditos: 5 }), true);
    assert.equal(seCobra({ estado: "ilimitado" }), false, "sin tope no hay nada que mover");
    assert.equal(seCobra({ estado: "sin_bolsa" }), false, "un update sobre cero filas finge cobrar");
    assert.equal(comoSeLeeElSaldo({ estado: "sin_bolsa" }), "sin bolsa de creditos");
});

test("B6 · una nota de voz decide IGUAL que una llamada", () => {
    if (ROTO) return;
    // Es el mismo Whisper sobre el mismo audio: si las dos pantallas
    // discreparan, la misma avería se le contaría al cliente de dos maneras.
    for (const saldo of [
        { estado: "ilimitado" },
        { estado: "sin_bolsa" },
        { estado: "quedan", creditos: 0 },
        { estado: "quedan", creditos: 9999 },
    ]) {
        const nota = queHacerConLaNota({ segundos: SEGUNDOS_DEL_REPORTE, saldo });
        const llamada = queHacerConLaGrabacion({
            segundos: SEGUNDOS_DEL_REPORTE,
            bytes: 1024,
            trozos: 1,
            saldo,
        });
        assert.equal(
            nota.hacer === "transcribir",
            llamada.hacer === "transcribir",
            `no coinciden con ${JSON.stringify(saldo)}`,
        );
        if (nota.hacer === "esperar") {
            assert.equal(nota.porque, llamada.hacer, "y el motivo tiene que ser el mismo");
            assert.deepEqual(nota.costo, llamada.costo, "y el precio también");
        }
    }
});

test("B7 · la marca viaja con la cuenta, y lo que no se entienda no inventa nada", () => {
    if (ROTO) return;
    assert.deepEqual(
        laMarcaDeLaLlamada({ motivo: "sin_bolsa", hacenFalta: 14, cuenta: " Verzay | Ventas " }),
        { motivo: "sin_bolsa", hacenFalta: 14, quedan: undefined, cuenta: "Verzay | Ventas" },
    );
    assert.equal(laMarcaDeLaLlamada({ motivo: "lo_que_sea" }), null);
    assert.equal(
        laMarcaDeLaLlamada({ motivo: "sin_bolsa", quedan: null }).quedan,
        undefined,
        "un `quedan` que no es un número no puede salir como 0",
    );

    const ensena = loQueSeEnsenaDeLaLlamada({
        transcript: null,
        hasRecording: true,
        motivo: "sin_bolsa",
        hacenFalta: 14,
        quedan: null,
        cuenta: "Verzay | Ventas",
        cargando: false,
    });
    assert.equal(ensena.estado, "fallo");
    assert.ok(ensena.texto.includes("Verzay | Ventas"));
    assert.equal(ensena.sePuedeReintentar, true);
});

/* ── C. El audio que no se puede cortar ─────────────────────────────────── */

/** Un WAV como el que graba AstraCalls: 16 kHz, 2 canales, 16 bits. */
function wavDe(segundos) {
    const canales = 2;
    const sampleRate = 16000;
    const bytesPorMuestra = 2 * canales;
    const datos = segundos * sampleRate * bytesPorMuestra;
    const buf = Buffer.alloc(44 + datos);
    buf.write("RIFF", 0, "ascii");
    buf.writeUInt32LE(36 + datos, 4);
    buf.write("WAVE", 8, "ascii");
    buf.write("fmt ", 12, "ascii");
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(canales, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * bytesPorMuestra, 28);
    buf.writeUInt16LE(bytesPorMuestra, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36, "ascii");
    buf.writeUInt32LE(datos, 40);
    return buf;
}

/** El contador de antes: sobre el NÚMERO, sin mirar si se puede cortar. */
function cuantosTrozosDeAntes(bytes, tope) {
    if (bytes <= tope) return 1;
    return Math.ceil(bytes / (tope - 44));
}

test("C1 · contar los trozos y cortarlos dan LO MISMO", () => {
    if (ROTO) return;
    // Encadenadas: con dos cuentas distintas, la decisión promete trozos que
    // nadie va a hacer.
    for (const segundos of [10, 420, 500, 900]) {
        const wav = wavDe(segundos);
        assert.equal(
            cuantosTrozosDeVerdad(wav, TOPE_DE_BYTES_DE_AUDIO),
            trozosDeWav(wav, TOPE_DE_BYTES_DE_AUDIO).length,
            `no coinciden con ${segundos} s`,
        );
    }
});

test("C2 · lo que NO se sabe cortar y no cabe se dice, no se manda a la red", () => {
    // Una grabación de Meta es webm: `trozosDeWav` la devuelve entera a
    // propósito —cortarla por bytes sería mandar basura—. Así que si no cabe,
    // no cabe.
    const webm = Buffer.alloc(TOPE_DE_BYTES_DE_AUDIO + 10, 7);

    if (ROTO) {
        // Lo de antes: la decisión contaba DOS trozos sobre un audio que sale
        // en UNO, se mandaba entero, OpenAI lo rechazaba por tamaño y la
        // llamada acababa diciendo «El servicio de transcripción no
        // respondió» — que es una respuesta falsa.
        assert.equal(cuantosTrozosDeAntes(webm.length, TOPE_DE_BYTES_DE_AUDIO), 2);
        assert.equal(trozosDeWav(webm, TOPE_DE_BYTES_DE_AUDIO).length, 1);
        const que = laDecisionDeAntes(60, 9e9, cuantosTrozosDeAntes(webm.length, TOPE_DE_BYTES_DE_AUDIO));
        assert.equal(que.hacer, "transcribir", "y se intentaba igual");
        return;
    }

    assert.equal(sePuedeCortar(webm), false);
    assert.equal(cuantosTrozosDeVerdad(webm, TOPE_DE_BYTES_DE_AUDIO), Infinity);

    const que = queHacerConLaGrabacion({
        segundos: 60,
        bytes: webm.length,
        trozos: cuantosTrozosDeVerdad(webm, TOPE_DE_BYTES_DE_AUDIO),
        saldo: { estado: "quedan", creditos: 9999 },
    });
    assert.equal(que.hacer, "demasiado_grande");
    assert.equal(que.sePuedeCortar, false);

    const aviso = porQueNoSeTranscribioLaGrabacion(que);
    assert.ok(aviso.includes("MB"), "tiene que decir cuánto pesa");
    assert.ok(
        !aviso.includes("minutos"),
        "prometer minutos sobre algo que no se parte manda a buscar una llamada larga que no existe",
    );
});

test("C3 · un WAV largo SÍ se parte, y eso no cambió", () => {
    if (ROTO) return;
    const largo = wavDe(500); // 32 MB
    assert.ok(largo.length > TOPE_DE_BYTES_DE_AUDIO);
    const trozos = cuantosTrozosDeVerdad(largo, TOPE_DE_BYTES_DE_AUDIO);
    assert.equal(trozos, 2);
    assert.equal(
        queHacerConLaGrabacion({
            segundos: 500,
            bytes: largo.length,
            trozos,
            saldo: { estado: "quedan", creditos: 9999 },
        }).hacer,
        "transcribir",
    );
    // Y el aviso de lo que de verdad es inabarcable sigue hablando de minutos.
    const inabarcable = queHacerConLaGrabacion({
        segundos: 36000,
        bytes: TOPE_DE_TROZOS * TOPE_DE_BYTES_DE_AUDIO + 1,
        trozos: TOPE_DE_TROZOS + 1,
        saldo: { estado: "quedan", creditos: 9e9 },
    });
    assert.equal(inabarcable.sePuedeCortar, true);
    assert.ok(porQueNoSeTranscribioLaGrabacion(inabarcable).includes("minutos"));
});

/** La decisión de ANTES, literal, para el modo roto. */
function laDecisionDeAntes(segundos, creditosDisponibles, trozos = 1) {
    if (trozos > TOPE_DE_TROZOS) return { hacer: "demasiado_grande" };
    const costo = costoDeLaNota(segundos);
    if (creditosDisponibles === null) return { hacer: "transcribir", costo };
    if (creditosDisponibles < costo.creditos) {
        return { hacer: "sin_creditos", costo, disponibles: creditosDisponibles };
    }
    return { hacer: "transcribir", costo };
}

/* ── D. El barrido: una sola puerta ─────────────────────────────────────── */

/**
 * Las CUATRO pantallas que transcriben audio con créditos.
 *
 * Lo que este bloque protege no es que cada una esté bien: es que a ninguna se
 * le pase. Es la familia de fallo de esta casa —*a una hermana se le pasa*— y
 * ya costó media docena de vueltas en otras suites.
 */
const LAS_CUATRO = [
    "lib/grabacion-de-llamada.server.ts", // la llamada (Astra y Meta)
    "actions/chat-manual-actions.ts", // la nota de voz de un chat
    "actions/chat-de-equipo-actions.ts", // la nota del chat del equipo
    "actions/salas-de-video-actions.ts", // la grabación de una reunión
];

/** Sin comentarios: el arreglo lleva escrito al lado por qué está. */
function sinComentarios(texto) {
    return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("D1 · las cuatro leen el saldo por la MISMA puerta", () => {
    for (const fichero of LAS_CUATRO) {
        const cuerpo = sinComentarios(readFileSync(fichero, "utf8"));
        assert.ok(
            // `laClaveYElSaldo` lee el saldo con `elSaldoDeLaFila`, la misma
            // regla, juzgada sobre la clave de OpenAI que de verdad se usa.
            cuerpo.includes("elSaldoDeLaCuenta(") || cuerpo.includes("laClaveYElSaldo("),
            `${fichero} no pasa por el lector común`,
        );
        assert.ok(
            !cuerpo.includes("losCreditosQueQuedan"),
            `${fichero} sigue con el lector de antes`,
        );
    }
});

test("D2 · y ninguna vuelve a decidir el cobro con un `!== null`", () => {
    if (ROTO) return;
    for (const fichero of LAS_CUATRO) {
        const cuerpo = sinComentarios(readFileSync(fichero, "utf8"));
        assert.ok(
            cuerpo.includes("seCobra("),
            `${fichero} tiene que preguntar si hay bolsa antes de descontar`,
        );
        assert.ok(
            !/quedan\s*!==\s*null/.test(cuerpo),
            `${fichero} decide el cobro comparando contra null, que es el reparto de antes`,
        );
    }
});

/**
 * Y el Perfil, que es donde la persona MIRA sus créditos.
 *
 * Es la tercera mitad del mismo fallo: con una regla propia, el Perfil podía
 * decir «0 disponibles» sobre una cuenta que el motor daba por ilimitada, y
 * entonces no hay forma de saber cuál de los dos miente.
 */
test("D3 · el Perfil lee los créditos con la misma regla", () => {
    const cuerpo = sinComentarios(readFileSync("actions/actions-ia-credits.ts", "utf8"));
    assert.ok(cuerpo.includes("elSaldoDeLaFila("), "el Perfil tiene su propia regla");
});
