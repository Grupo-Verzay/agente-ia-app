/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Un proveedor que nadie usa NO esta roto.**
 *
 * De donde sale: los dos avisos destacados de la pantalla de salud del envio
 * —«lleva mas de un dia sin un envio correcto» y «la tasa de fallo se paso del
 * umbral»— son inutiles el dia que salen siempre. Una plataforma sin ninguna
 * linea Meta veria «Meta no ha conseguido enviar nada» todos los dias de su
 * vida, y un aviso que sale siempre se aprende a despachar sin leer — con lo
 * que el dia que Waha se caiga de verdad, ese tambien se ignora. Es el fallo
 * del que viene la ventana que interrumpe de Proyectos.
 *
 * Aqui corren las funciones REALES de `lib/salud-del-envio.ts`, que es puro:
 * entra una lista de envios y salen el resumen y los avisos.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 * ver la cabecera de `quien-manda-en-un-cliente.test.mjs` — el mismo
 * procedimiento, con `lib/salud-del-envio.ts` en la lista de ficheros.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
    resumirPorProveedor,
    losAvisosDeSalud,
    comoMotivo,
    comoProveedor,
    comoTipoDeEnvio,
    MINIMO_PARA_JUZGAR,
    TOPE_DEL_MOTIVO,
} = await import("./.compilado/salud-del-envio.js");

const AHORA = new Date("2026-09-18T12:00:00.000Z");
const haceHoras = (h) => new Date(AHORA.getTime() - h * 60 * 60 * 1000);

let n = 0;
const envio = (proveedor, salio, creadoEn, extra = {}) => ({
    id: `e${++n}`,
    tipo: "cobro",
    proveedor,
    cuentaId: "atencion",
    cuentaNombre: "Verzay | Atencion",
    linea: "VERZAY_ATENCION",
    destinatario: "573001112233@s.whatsapp.net",
    salio,
    motivo: salio ? null : "No autorizado.",
    creadoEn,
    ...extra,
});

/* ── El resumen ───────────────────────────────────────────────────────────── */

test("el resumen cuenta por proveedor y guarda el ultimo acierto", () => {
    const [waha] = resumirPorProveedor([
        envio("waha", true, haceHoras(30)),
        envio("waha", false, haceHoras(2)),
        envio("waha", false, haceHoras(1)),
    ]);

    assert.equal(waha.proveedor, "waha");
    assert.equal(waha.total, 3);
    assert.equal(waha.salieron, 1);
    assert.equal(waha.fallaron, 2);
    assert.equal(waha.ultimoBueno.toISOString(), haceHoras(30).toISOString());
    assert.equal(waha.ultimoIntento.toISOString(), haceHoras(1).toISOString());
});

test("sin ningun intento la tasa de fallo es null, NUNCA cero", () => {
    // Es la regla de *un numero que no se puede calcular no se sustituye por
    // otro*. Un «0 % de fallo» sobre cero envios diria que todo va perfecto,
    // que es el peor numero posible en una pantalla que existe para cazar que
    // NO salga nada.
    assert.deepEqual(resumirPorProveedor([]), []);

    const [solo] = resumirPorProveedor([envio("meta", false, haceHoras(1))]);
    assert.equal(solo.tasaDeFallo, 1);
    assert.notEqual(solo.tasaDeFallo, 0);
});

/* ── Los avisos ───────────────────────────────────────────────────────────── */

test("un proveedor sin un solo acierto y CON intentos se avisa", () => {
    const avisos = losAvisosDeSalud(
        resumirPorProveedor([
            envio("waha", false, haceHoras(50)),
            envio("waha", false, haceHoras(20)),
            envio("waha", false, haceHoras(1)),
        ]),
        AHORA,
    );

    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].proveedor, "waha");
    assert.equal(avisos[0].clase, "sin_acierto");
    assert.match(avisos[0].texto, /no ha conseguido enviar NADA/);
});

test("y un proveedor SIN intentos no se avisa: esta parado, no roto", () => {
    // El caso de verdad: una plataforma que no tiene ninguna linea Meta. Sin
    // esta condicion, ese aviso saldria todos los dias y ensenaria a ignorar
    // los avisos — incluido el que si importa.
    assert.deepEqual(losAvisosDeSalud(resumirPorProveedor([]), AHORA), []);

    const soloEvolution = losAvisosDeSalud(
        resumirPorProveedor([envio("evolution", true, haceHoras(1))]),
        AHORA,
    );
    assert.deepEqual(soloEvolution, []);
});

test("un acierto reciente calla el aviso de «sin acierto»", () => {
    const avisos = losAvisosDeSalud(
        resumirPorProveedor([
            envio("evolution", false, haceHoras(40)),
            envio("evolution", true, haceHoras(3)),
        ]),
        AHORA,
    );
    assert.deepEqual(avisos, []);
});

test("mas de 24 h desde el ultimo acierto, con intentos por medio, si avisa", () => {
    const avisos = losAvisosDeSalud(
        resumirPorProveedor([
            envio("waha", true, haceHoras(40)),
            envio("waha", false, haceHoras(2)),
        ]),
        AHORA,
    );
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, "sin_acierto");
    assert.match(avisos[0].texto, /40 h sin un solo envio correcto|40 h sin un solo envío correcto/);
});

test("la tasa de fallo no se juzga por debajo del minimo de intentos", () => {
    // Un envio y un fallo son el 100 %, y eso no dice nada: una linea que mando
    // un mensaje en tres dias y le reboto no es una plataforma caida. El aviso
    // tiene que significar algo la primera vez que sale.
    const pocos = losAvisosDeSalud(
        resumirPorProveedor([
            envio("evolution", true, haceHoras(3)),
            envio("evolution", false, haceHoras(2)),
        ]),
        AHORA,
    );
    assert.deepEqual(pocos, []);

    // Con el minimo cubierto y un acierto reciente, ya si.
    const bastantes = [envio("evolution", true, haceHoras(3))];
    for (let i = 0; i < MINIMO_PARA_JUZGAR; i++) {
        bastantes.push(envio("evolution", false, haceHoras(2)));
    }
    const avisos = losAvisosDeSalud(resumirPorProveedor(bastantes), AHORA);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, "tasa_de_fallo");
});

test("un proveedor muerto da UN aviso, no dos", () => {
    // Con cero aciertos la tasa es del 100 % y diria lo mismo con otras
    // palabras. Dos avisos para un solo problema es ruido.
    const todos = [];
    for (let i = 0; i < MINIMO_PARA_JUZGAR + 2; i++) {
        todos.push(envio("waha", false, haceHoras(i + 1)));
    }
    const avisos = losAvisosDeSalud(resumirPorProveedor(todos), AHORA);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, "sin_acierto");
});

test("«sin linea» es su propio proveedor y se avisa como los demas", () => {
    // Sin esta casilla el fallo mas silencioso —la cuenta se quedo sin linea y
    // a sus clientes no les llega nada— no apareceria en ninguna fila.
    const [r] = resumirPorProveedor([
        envio("ninguno", false, haceHoras(5)),
        envio("ninguno", false, haceHoras(1)),
    ]);
    assert.equal(r.proveedor, "ninguno");
    const avisos = losAvisosDeSalud([r], AHORA);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, "sin_acierto");
});

/* ── Lo que llega de fuera ────────────────────────────────────────────────── */

test("un tipo o un proveedor inventado no pasa", () => {
    assert.equal(comoTipoDeEnvio("cobro"), "cobro");
    assert.equal(comoTipoDeEnvio("lo-que-sea"), null);
    assert.equal(comoTipoDeEnvio(7), null);
    assert.equal(comoProveedor("WAHA"), "waha");
    assert.equal(comoProveedor("twilio"), null);
});

test("un motivo vacio es null, y uno enorme se recorta", () => {
    // «No se sabe por que» y «no hubo motivo» tienen que poder distinguirse.
    assert.equal(comoMotivo(""), null);
    assert.equal(comoMotivo("   "), null);
    assert.equal(comoMotivo(null), null);

    const largo = "x".repeat(TOPE_DEL_MOTIVO + 500);
    const recortado = comoMotivo(largo);
    assert.equal(recortado.length, TOPE_DEL_MOTIVO);
    assert.ok(recortado.endsWith("…"));
});
