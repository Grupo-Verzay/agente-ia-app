/**
 * Grabar una reunion, volver despues de un corte, y lo que cuesta cada cosa.
 *
 * Todo lo que este banco prueba es **puro y se equivoca sin dar ningun error**,
 * que es la familia de fallo que esta suite paga cara:
 *
 *   1. **El tamano de una parte.** Las partes se juntan con un multipart de S3,
 *      y ahi toda parte menos la ultima tiene que pasar de 5 MiB. Una parte
 *      corta no falla al subirla: falla **al juntar**, con la reunion ya
 *      grabada y la persona esperando su fichero.
 *   2. **El orden de las partes.** Un listado de S3 ordena como TEXTO. Sin
 *      rellenar el numero, la parte 10 va antes que la 2 y el webm sale con los
 *      trozos cambiados de sitio — que no da error, solo se ve mal.
 *   3. **Que se puede transcribir y que no.** El tope es de OpenAI, no nuestro,
 *      y va sobre bytes y no sobre minutos. Preguntarlo mal es un boton que al
 *      pulsarlo da error.
 *   4. **Por que se salio de la sala.** Los tres caminos escribian `fuera`; si
 *      se confunden, la pestana de alguien a quien acaban de echar vuelve a
 *      entrar sola.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc -p lib/__tests__/tsconfig.banco.json
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    GRACIA_DE_DISCONNECTED_MS,
    TOPE_PARA_RECONECTAR_MS,
    comoSeLeeLaReconexion,
    esMotivoDeSalida,
    estaMuertaLaConexion,
    hayQueRendirse,
    sePuedeReanudar,
} from "./.compilado/lib/reconexion-de-la-sala.js";
import {
    AUDIO_BPS,
    AVISAR_A_LOS_DIAS,
    CUANDO_AVISAR,
    DIAS_DE_GRABACION,
    MINIMO_DE_PARTE,
    TAMANO_DE_PARTE,
    TOPE_DE_OPENAI,
    TOPE_POR_CUENTA,
    bytesPorHora,
    comoEntraElVideo,
    comoSeLeenLosBytes,
    comoVaElCupo,
    diasQueLeQuedan,
    esModoDeGrabacion,
    lasCasillasDelLienzo,
    llaveDeLaGrabacion,
    llaveDeLaParte,
    loQueSeLeManda,
    porQueNoSeTranscribe,
    queHacerConLaGrabacion,
    sePuedeMandarLaParte,
    seSigueGrabando,
    TOPE_DEL_RESUMEN,
} from "./.compilado/lib/grabacion-de-reunion.js";
import { costoDeLaNota } from "./.compilado/lib/transcripcion-de-voz.js";

// ── Volver despues de un corte ──────────────────────────────────────────────

test("solo el silencio se reanuda solo", () => {
    // Es la condicion entera: a quien sacaron, o quien colgo, no se le devuelve
    // a la reunion dos segundos despues.
    assert.equal(sePuedeReanudar("silencio"), true);
    assert.equal(sePuedeReanudar("sacado"), false);
    assert.equal(sePuedeReanudar("salio"), false);
});

test("una fila vieja, sin motivo, NO se reanuda", () => {
    // Las filas de antes de la columna traen `null`. Se ve de menos, nunca de
    // mas: el boton de volver a entrar a mano sigue ahi.
    assert.equal(sePuedeReanudar(null), false);
    assert.equal(sePuedeReanudar(undefined), false);
    assert.equal(sePuedeReanudar(""), false);
    assert.equal(sePuedeReanudar("cualquier_cosa"), false);
});

test("los motivos son tres y nada mas", () => {
    for (const m of ["silencio", "salio", "sacado"]) assert.equal(esMotivoDeSalida(m), true);
    assert.equal(esMotivoDeSalida("fuera"), false);
    assert.equal(esMotivoDeSalida(null), false);
    assert.equal(esMotivoDeSalida(7), false);
});

test("`failed` y `closed` son firmes; `disconnected` tiene gracia", () => {
    // `disconnected` es el estado dudoso de WebRTC: se recupera solo al segundo
    // siguiente. Tirar la conexion ahi seria rehacer media reunion cada vez que
    // alguien pasa por debajo de un puente.
    assert.equal(estaMuertaLaConexion({ estado: "failed", desdeMs: 0 }), true);
    assert.equal(estaMuertaLaConexion({ estado: "closed", desdeMs: 0 }), true);
    assert.equal(estaMuertaLaConexion({ estado: "disconnected", desdeMs: 0 }), false);
    assert.equal(
        estaMuertaLaConexion({ estado: "disconnected", desdeMs: GRACIA_DE_DISCONNECTED_MS - 1 }),
        false,
    );
    assert.equal(
        estaMuertaLaConexion({ estado: "disconnected", desdeMs: GRACIA_DE_DISCONNECTED_MS }),
        true,
    );
});

test("una conexion sana NO se rehace, este el tiempo que este", () => {
    // Sin esto, la malla se rehaceria sola cada dos segundos y la reunion
    // entera parpadearia.
    for (const e of ["new", "connecting", "connected"]) {
        assert.equal(estaMuertaLaConexion({ estado: e, desdeMs: 10 * 60_000 }), false);
    }
});

test("el plazo para volver deja sitio a DOS barridos del servidor", () => {
    // El barrido saca a los 21 s. Con menos de un minuto, un corte de movil al
    // cambiar de antena se rendiria justo antes de poder volver.
    assert.ok(TOPE_PARA_RECONECTAR_MS >= 2 * 21_000);
    assert.equal(hayQueRendirse(0), false);
    assert.equal(hayQueRendirse(TOPE_PARA_RECONECTAR_MS - 1), false);
    assert.equal(hayQueRendirse(TOPE_PARA_RECONECTAR_MS), true);
});

test("mientras se reconecta se dice cuanto queda, y al final no se miente", () => {
    assert.match(comoSeLeeLaReconexion(0), /Reconectando/);
    assert.match(comoSeLeeLaReconexion(0), /60s/);
    assert.match(comoSeLeeLaReconexion(TOPE_PARA_RECONECTAR_MS), /No se pudo/);
});

// ── Las partes ──────────────────────────────────────────────────────────────

test("una parte corta NO se manda... salvo la ultima", () => {
    // Esto es lo que impide que juntar falle al final: S3 exige 5 MiB en todas
    // menos en la ultima.
    assert.equal(sePuedeMandarLaParte({ bytes: 1024, esLaUltima: false }), false);
    assert.equal(sePuedeMandarLaParte({ bytes: TAMANO_DE_PARTE - 1, esLaUltima: false }), false);
    assert.equal(sePuedeMandarLaParte({ bytes: TAMANO_DE_PARTE, esLaUltima: false }), true);
    assert.equal(sePuedeMandarLaParte({ bytes: 1024, esLaUltima: true }), true);
});

test("y una parte VACIA no se manda ni siendo la ultima", () => {
    // Un fichero de cero bytes en el bucket es una parte que `composeObject`
    // acepta y que deja el webm con un hueco.
    assert.equal(sePuedeMandarLaParte({ bytes: 0, esLaUltima: true }), false);
    assert.equal(sePuedeMandarLaParte({ bytes: -1, esLaUltima: true }), false);
});

test("el tamano de parte pasa del minimo de S3", () => {
    // Si alguien lo baja por debajo, juntar empieza a fallar SOLO en las
    // grabaciones de mas de una parte — o sea en las largas, que son las que
    // importan.
    assert.ok(TAMANO_DE_PARTE > MINIMO_DE_PARTE);
    assert.equal(MINIMO_DE_PARTE, 5 * 1024 * 1024);
});

test("las llaves de las partes ORDENAN como texto", () => {
    // El fallo que esto evita: en un listado de S3 «10» va antes que «2».
    const llaves = [2, 10, 1].map((n) =>
        llaveDeLaParte({ cuentaId: "c", grabacionId: "g", cual: "audio", numero: n }),
    );
    const ordenadas = [...llaves].sort();
    assert.deepEqual(ordenadas, [
        llaveDeLaParte({ cuentaId: "c", grabacionId: "g", cual: "audio", numero: 1 }),
        llaveDeLaParte({ cuentaId: "c", grabacionId: "g", cual: "audio", numero: 2 }),
        llaveDeLaParte({ cuentaId: "c", grabacionId: "g", cual: "audio", numero: 10 }),
    ]);
});

test("audio y video no se pisan, y cuelgan de la cuenta", () => {
    const a = llaveDeLaGrabacion({ cuentaId: "c1", grabacionId: "g1", cual: "audio" });
    const v = llaveDeLaGrabacion({ cuentaId: "c1", grabacionId: "g1", cual: "video" });
    assert.notEqual(a, v);
    assert.ok(a.startsWith("c1/"));
    assert.ok(v.startsWith("c1/"));
    // Y la carpeta de las partes no choca con el fichero ya junto.
    const p = llaveDeLaParte({ cuentaId: "c1", grabacionId: "g1", cual: "audio", numero: 1 });
    assert.notEqual(p, a);
});

// ── El cupo ─────────────────────────────────────────────────────────────────

test("el cupo avisa antes de llenarse, no despues", () => {
    const poco = comoVaElCupo(TOPE_POR_CUENTA * 0.5);
    assert.equal(poco.cerca, false);
    assert.equal(poco.lleno, false);

    const casi = comoVaElCupo(TOPE_POR_CUENTA * CUANDO_AVISAR);
    assert.equal(casi.cerca, true);
    assert.equal(casi.lleno, false);

    const lleno = comoVaElCupo(TOPE_POR_CUENTA);
    assert.equal(lleno.lleno, true);
});

test("pasarse del tope no da una parte mayor que uno", () => {
    // Una barra al 140 % se sale de su caja y se lee como un fallo de pintado.
    const pasado = comoVaElCupo(TOPE_POR_CUENTA * 3);
    assert.equal(pasado.parte, 1);
    assert.equal(pasado.lleno, true);
});

test("un cupo imposible cae en cero, no en NaN", () => {
    for (const v of [NaN, -5, undefined, null]) {
        const c = comoVaElCupo(v);
        assert.equal(c.usados, 0);
        assert.equal(c.parte, 0);
        assert.equal(c.lleno, false);
    }
});

test("los bytes se leen con su unidad", () => {
    assert.equal(comoSeLeenLosBytes(0), "0 B");
    assert.equal(comoSeLeenLosBytes(512), "512 B");
    assert.match(comoSeLeenLosBytes(1024 * 1024), /MB$/);
    assert.match(comoSeLeenLosBytes(20 * 1024 * 1024 * 1024), /GB$/);
});

test("una hora de audio cabe en lo que acepta OpenAI", () => {
    // Es lo que hace posible transcribir una reunion de una hora sin partirla,
    // y por eso el bitrate es el que es. A 64 kbps dejaria de caber.
    const unaHora = bytesPorHora("audio");
    assert.ok(unaHora < TOPE_DE_OPENAI, `una hora de audio son ${unaHora} y el tope es ${TOPE_DE_OPENAI}`);
    assert.equal(unaHora, (AUDIO_BPS / 8) * 3600);
});

test("y una hora de video pesa mucho mas que una de audio", () => {
    assert.ok(bytesPorHora("video") > bytesPorHora("audio") * 10);
});

// ── Transcribir ─────────────────────────────────────────────────────────────

test("lo ya transcrito se contesta ANTES de mirar creditos", () => {
    // Al reves, una grabacion ya transcrita diria «no hay creditos» en vez de
    // ensenar su texto.
    const que = queHacerConLaGrabacion({
        yaTranscrita: true,
        audioBytes: 1_000_000,
        costo: { creditos: 60, tokens: 1 },
        creditosDisponibles: 0,
    });
    assert.equal(que.hacer, "ya_esta");
    assert.equal(porQueNoSeTranscribe(que), null);
});

test("sin audio no hay nada que transcribir, y se dice", () => {
    for (const bytes of [0, null]) {
        const que = queHacerConLaGrabacion({
            yaTranscrita: false,
            audioBytes: bytes,
            costo: costoDeLaNota(60),
            creditosDisponibles: null,
        });
        assert.equal(que.hacer, "sin_audio");
        assert.match(porQueNoSeTranscribe(que), /audio/i);
    }
});

test("el tope va sobre BYTES, que es el limite de verdad", () => {
    const cabe = queHacerConLaGrabacion({
        yaTranscrita: false,
        audioBytes: TOPE_DE_OPENAI,
        costo: costoDeLaNota(3600),
        creditosDisponibles: null,
    });
    assert.equal(cabe.hacer, "transcribir");

    const no = queHacerConLaGrabacion({
        yaTranscrita: false,
        audioBytes: TOPE_DE_OPENAI + 1,
        costo: costoDeLaNota(3600),
        creditosDisponibles: null,
    });
    assert.equal(no.hacer, "demasiado_grande");
    assert.match(porQueNoSeTranscribe(no), /larga/i);
});

test("sin creditos se dice CUANTOS hacen falta y cuantos quedan", () => {
    // «No hay creditos» a secas no le sirve a quien tiene que recargar.
    const costo = costoDeLaNota(600);
    const que = queHacerConLaGrabacion({
        yaTranscrita: false,
        audioBytes: 1_000_000,
        costo,
        creditosDisponibles: costo.creditos - 1,
    });
    assert.equal(que.hacer, "sin_creditos");
    const texto = porQueNoSeTranscribe(que);
    assert.match(texto, new RegExp(String(costo.creditos)));
    assert.match(texto, new RegExp(String(costo.creditos - 1)));
});

test("ilimitados NO es cero", () => {
    // `null` son ilimitados —la cuenta paga su propia IA— y confundirlo con
    // cero dejaria a esas cuentas sin poder transcribir nada.
    const que = queHacerConLaGrabacion({
        yaTranscrita: false,
        audioBytes: 1_000_000,
        costo: costoDeLaNota(3600),
        creditosDisponibles: null,
    });
    assert.equal(que.hacer, "transcribir");
});

test("la tarifa es la MISMA de las notas de voz, prorrateada", () => {
    // Seis creditos por minuto. Si alguien escribe otra tarifa aqui, esto se
    // pone rojo — que es justo lo que no se nota mirando una factura.
    assert.equal(costoDeLaNota(60).creditos, 6);
    assert.equal(costoDeLaNota(30).creditos, 3);
    // Prorrateado y nunca cero: una reunion de cuatro segundos cuesta uno.
    assert.equal(costoDeLaNota(4).creditos, 1);
    assert.equal(costoDeLaNota(3600).creditos, 360);
});

test("el resumen recorta por el PRINCIPIO, no por el final", () => {
    // Si hay que dejar algo fuera, que sea el saludo y no los acuerdos.
    const largo = "a".repeat(TOPE_DEL_RESUMEN) + "ACUERDOS";
    const mandado = loQueSeLeManda(largo);
    assert.equal(mandado.length, TOPE_DEL_RESUMEN);
    assert.ok(mandado.endsWith("ACUERDOS"));
});

// ── El aviso de que se esta grabando ────────────────────────────────────────

test("el aviso de grabacion CADUCA", () => {
    // Sin caducar, una reunion diria «grabando» para siempre despues de que a
    // quien grababa se le cerrara el portatil.
    const ahora = Date.now();
    assert.equal(seSigueGrabando(new Date(ahora - 1000), ahora), true);
    assert.equal(seSigueGrabando(new Date(ahora - 60_000), ahora), false);
    assert.equal(seSigueGrabando(null, ahora), false);
    assert.equal(seSigueGrabando(undefined, ahora), false);
    assert.equal(seSigueGrabando("no es una fecha", ahora), false);
});

test("y admite la marca como texto, que es como llega de la base", () => {
    const ahora = Date.now();
    assert.equal(seSigueGrabando(new Date(ahora - 1000).toISOString(), ahora), true);
});

// ── Cuanto se guarda ────────────────────────────────────────────────────────

test("una grabacion vive 180 dias y se avisa antes de que se vaya", () => {
    assert.equal(DIAS_DE_GRABACION, 180);
    assert.ok(AVISAR_A_LOS_DIAS < DIAS_DE_GRABACION);
    const ahora = new Date("2026-09-20T00:00:00Z");
    assert.equal(diasQueLeQuedan(new Date("2026-09-20T00:00:00Z"), ahora), 180);
    assert.equal(diasQueLeQuedan(new Date("2026-03-24T00:00:00Z"), ahora), 0);
    // Y nunca negativo: «se borra en -3 dias» no dice nada.
    assert.equal(diasQueLeQuedan(new Date("2020-01-01T00:00:00Z"), ahora), 0);
});

// ── El lienzo ───────────────────────────────────────────────────────────────

test("el lienzo se reparte entero, sin huecos ni solapes", () => {
    for (const n of [1, 2, 3, 4]) {
        const casillas = lasCasillasDelLienzo(n, 1280, 720);
        assert.equal(casillas.length, n);
        const area = casillas.reduce((s, c) => s + c.ancho * c.alto, 0);
        assert.equal(area, 1280 * 720, `con ${n} el lienzo no se cubre entero`);
        for (const c of casillas) {
            assert.ok(c.x >= 0 && c.y >= 0);
            assert.ok(c.x + c.ancho <= 1280);
            assert.ok(c.y + c.alto <= 720);
        }
    }
});

test("con tres, el tercero ocupa el ancho de abajo", () => {
    // Media fila en negro se lee como que falta alguien.
    const c = lasCasillasDelLienzo(3, 1280, 720);
    assert.equal(c[2].ancho, 1280);
    assert.equal(c[2].x, 0);
});

test("sin nadie, el lienzo no tiene casillas", () => {
    assert.deepEqual(lasCasillasDelLienzo(0), []);
    assert.deepEqual(lasCasillasDelLienzo(-3), []);
});

test("un video entra RECORTADO, no estirado", () => {
    // Una cara aplastada se nota a la primera; una recortada por los lados, no.
    const casilla = { x: 0, y: 0, ancho: 640, alto: 360 };
    // Un video mas ancho de lo que cabe: se recorta a los lados.
    const ancho = comoEntraElVideo({ anchoDelVideo: 1920, altoDelVideo: 540, casilla });
    assert.equal(ancho.sh, 540);
    assert.ok(ancho.sw < 1920);
    assert.ok(ancho.sx > 0);
    // Uno mas alto: se recorta arriba y abajo.
    const alto = comoEntraElVideo({ anchoDelVideo: 480, altoDelVideo: 640, casilla });
    assert.equal(alto.sw, 480);
    assert.ok(alto.sh < 640);
    assert.ok(alto.sy > 0);
    // Y la proporcion del recorte es la de la casilla, siempre.
    for (const r of [ancho, alto]) {
        assert.ok(Math.abs(r.sw / r.sh - casilla.ancho / casilla.alto) < 0.02);
    }
});

test("un video sin medidas no se dibuja", () => {
    // Un `<video>` que todavia no cargo da 0x0, y dividir por eso da NaN: el
    // `drawImage` lanzaria y se llevaria el fotograma entero.
    assert.equal(
        comoEntraElVideo({
            anchoDelVideo: 0,
            altoDelVideo: 0,
            casilla: { x: 0, y: 0, ancho: 10, alto: 10 },
        }),
        null,
    );
});

test("los modos son dos, y lo que no se reconoce no es uno", () => {
    assert.equal(esModoDeGrabacion("audio"), true);
    assert.equal(esModoDeGrabacion("video"), true);
    assert.equal(esModoDeGrabacion("pantalla"), false);
    assert.equal(esModoDeGrabacion(null), false);
});
