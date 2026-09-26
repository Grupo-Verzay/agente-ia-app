/**
 * Los tres controles del anfitrión: sacar, silenciar y el aviso de la puerta.
 *
 * Lo que se prueba aquí es lo que **no se ve mirando la pantalla**:
 *
 *   1. **Qué se ofrece.** Los mandos se pintan en DOS sitios —el recuadro de
 *      la persona y la lista de gente del panel— y los dos tienen que decir lo
 *      mismo. Si discreparan, desde un sitio se ofrecería algo que desde el
 *      otro no, y eso no se lee como un fallo: se lee como que «a veces no
 *      deja».
 *   2. **Que lo ofrecido no lo rechaza el servidor.** Un mando que al pulsarlo
 *      da error es peor que no tenerlo.
 *   3. **Cuándo suena la puerta.** Sonar de más enseña a ignorar el aviso, y
 *      entonces el que importa se ignora también. Y sonar de menos es el fallo
 *      del que viene todo esto: alguien esperando y nadie enterándose.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que está en .gitignore):
 *
 *   npx tsc -p lib/__tests__/tsconfig.banco.json
 *
 * O entero, con su mitad de navegador: `scripts/banco-controles-de-la-reunion.sh`
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { losMandosDeModeracion } from "./.compilado/lib/moderar-en-la-sala.js";
import {
    CADA_CUANTO_SUENA_LA_PUERTA_MS,
    TONO_DE_LA_PUERTA,
    elAvisoDeLaPuerta,
    losQueEsperanSinAtender,
    tocaSonarEnLaPuerta,
} from "./.compilado/lib/aviso-de-la-puerta.js";
import { TONO_DEL_EQUIPO } from "./.compilado/lib/aviso-del-equipo.js";

const leer = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

// ── 1. Qué se ofrece, y a quién ─────────────────────────────────────────────

const ALGUIEN = { moderas: true, soyYo: false, micEncendido: true, nombre: "Ana" };

test("quien organiza ve los dos mandos sobre los demás", () => {
    const m = losMandosDeModeracion(ALGUIEN);
    assert.equal(m.hayMenu, true);
    assert.equal(m.silenciar.puede, true);
    assert.equal(m.sacar.puede, true);
});

test("quien NO organiza no ve ningún mando, y no se le pinta un menú vacío", () => {
    const m = losMandosDeModeracion({ ...ALGUIEN, moderas: false });
    assert.equal(m.hayMenu, false, "sin menú, no un menú con todo apagado");
    assert.equal(m.silenciar.puede, false);
    assert.equal(m.sacar.puede, false);
});

test("sobre UNO MISMO no se pinta nada: callarse y colgar tienen su propio botón", () => {
    const m = losMandosDeModeracion({ ...ALGUIEN, soyYo: true });
    assert.equal(m.hayMenu, false);
    assert.equal(m.sacar.puede, false, "sacarse a uno mismo es colgar");
    assert.equal(m.silenciar.puede, false, "callarse tiene su botón, y ese sí apaga la pista");
});

test("a quien ya tiene el micro apagado no se le pide silencio, pero SÍ se le puede sacar", () => {
    const m = losMandosDeModeracion({ ...ALGUIEN, micEncendido: false });
    assert.equal(m.hayMenu, true, "el menú sigue: sacar no depende del micro");
    assert.equal(m.silenciar.puede, false);
    assert.equal(m.sacar.puede, true);
});

test("a quien ya no está dentro no se le ofrece nada", () => {
    // El servidor lo rechaza con «Esa persona ya no está en la reunión»; si se
    // ofreciera, sería un botón que da error.
    const m = losMandosDeModeracion({ ...ALGUIEN, estaDentro: false });
    assert.equal(m.hayMenu, false);
});

test("un mando apagado SIEMPRE dice por qué", () => {
    // Un botón gris sin explicación se lee como que la App está rota, no como
    // que esa persona ya tiene el micrófono apagado.
    for (const caso of [
        ALGUIEN,
        { ...ALGUIEN, micEncendido: false },
        { ...ALGUIEN, moderas: false },
        { ...ALGUIEN, soyYo: true },
    ]) {
        const m = losMandosDeModeracion(caso);
        assert.ok(m.silenciar.porQue.length > 0, "silenciar siempre dice algo");
        assert.ok(m.sacar.porQue.length > 0, "sacar siempre dice algo");
    }
});

test("el rótulo nombra a la persona, para no sacar a quien no era", () => {
    const m = losMandosDeModeracion({ ...ALGUIEN, nombre: "Beto" });
    assert.match(m.sacar.porQue, /Beto/);
    assert.match(m.silenciar.porQue, /Beto/);
});

// ── 2. Encadenado con el SERVIDOR ───────────────────────────────────────────
//
// No se puede llamar a la acción desde aquí —necesita sesión y Postgres— pero
// sí se puede comprobar que las condiciones que rechaza son EXACTAMENTE las
// que esta función no ofrece. Leer el fichero es más honesto que copiar las
// tres condiciones a mano: copiadas, el día que el servidor añada una cuarta
// este banco seguiría en verde sobre una regla que ya no es la suya.

test("las tres cosas que el servidor rechaza son las tres que aquí no se ofrecen", () => {
    const acciones = leer("actions/salas-de-video-actions.ts");

    // (a) Moderar. El servidor pide `puedeAdministrarLaSala` en las dos.
    assert.match(acciones, /Solo quien organiza la reunión puede silenciar a alguien\./);
    assert.match(acciones, /Solo quien organiza la reunión puede sacar a alguien\./);
    assert.equal(losMandosDeModeracion({ ...ALGUIEN, moderas: false }).hayMenu, false);

    // (b) Sobre uno mismo.
    assert.match(acciones, /Para salir, usa el botón de colgar\./);
    assert.match(acciones, /Para callarte, usa tu botón de micrófono\./);
    assert.equal(losMandosDeModeracion({ ...ALGUIEN, soyYo: true }).hayMenu, false);

    // (c) Quien ya no está dentro.
    assert.match(acciones, /Esa persona ya no está en la reunión\./);
    assert.equal(losMandosDeModeracion({ ...ALGUIEN, estaDentro: false }).hayMenu, false);
});

// ── 3. El aviso de la puerta ────────────────────────────────────────────────

const ESPERAN = (...ids) => ids.map((id) => ({ id }));

test("suena mientras haya alguien esperando", () => {
    assert.equal(
        tocaSonarEnLaPuerta({
            cuantosEsperan: 1,
            abroLaPuerta: true,
            silenciado: false,
            ultimoSonido: null,
        }),
        true,
    );
});

test("la primera vez suena YA, sin esperarse el intervalo", () => {
    // Quien llama a la puerta lleva esperando desde antes de que su fila
    // llegara aquí: hacerle esperar el intervalo entero es empezar tarde.
    assert.equal(
        tocaSonarEnLaPuerta({
            cuantosEsperan: 1,
            abroLaPuerta: true,
            silenciado: false,
            ultimoSonido: null,
            ahora: 1_000,
        }),
        true,
    );
});

test("se repite cada pocos segundos, y NO más seguido", () => {
    const base = { cuantosEsperan: 1, abroLaPuerta: true, silenciado: false };
    const t = 100_000;
    assert.equal(
        tocaSonarEnLaPuerta({ ...base, ultimoSonido: t, ahora: t + 1 }),
        false,
        "no dos pitidos pegados",
    );
    assert.equal(
        tocaSonarEnLaPuerta({
            ...base,
            ultimoSonido: t,
            ahora: t + CADA_CUANTO_SUENA_LA_PUERTA_MS - 1,
        }),
        false,
    );
    assert.equal(
        tocaSonarEnLaPuerta({ ...base, ultimoSonido: t, ahora: t + CADA_CUANTO_SUENA_LA_PUERTA_MS }),
        true,
        "al cumplirse el intervalo, otra vez",
    );
});

test("el intervalo es de pocos segundos: ni una alarma ni un aviso que se pierde", () => {
    assert.ok(CADA_CUANTO_SUENA_LA_PUERTA_MS >= 3_000, "más seguido sería una alarma");
    assert.ok(CADA_CUANTO_SUENA_LA_PUERTA_MS <= 15_000, "más espaciado se pierde");
});

test("PARA en cuanto no queda nadie esperando", () => {
    assert.equal(
        tocaSonarEnLaPuerta({
            cuantosEsperan: 0,
            abroLaPuerta: true,
            silenciado: false,
            ultimoSonido: null,
        }),
        false,
    );
});

test("para AL PULSAR, sin esperar la vuelta del reloj", () => {
    // Es lo que hace que «Dejar entrar» no se pulse dos veces: entre el clic y
    // la vuelta que trae la lista sin esa persona pasan un par de segundos.
    const esperando = ESPERAN("ana");
    assert.equal(losQueEsperanSinAtender({ esperando, yaDecididos: [] }).length, 1);
    assert.equal(losQueEsperanSinAtender({ esperando, yaDecididos: ["ana"] }).length, 0);
});

test("si el servidor dice que no, esa persona VUELVE a contar", () => {
    // La sala está llena: sigue esperando, así que el aviso vuelve. Es la misma
    // regla que devolver la fila del chat que no se pudo borrar.
    const esperando = ESPERAN("ana");
    const devuelto = losQueEsperanSinAtender({ esperando, yaDecididos: [] });
    assert.deepEqual(devuelto, ["ana"]);
});

test("decidir sobre uno no calla el aviso de los demás", () => {
    const quedan = losQueEsperanSinAtender({
        esperando: ESPERAN("ana", "beto"),
        yaDecididos: ["ana"],
    });
    assert.deepEqual(quedan, ["beto"]);
});

test("a quien no puede abrir la puerta NO le suena", () => {
    // Sonaría por algo que no puede atender, que es ruido puro.
    assert.equal(
        tocaSonarEnLaPuerta({
            cuantosEsperan: 2,
            abroLaPuerta: false,
            silenciado: false,
            ultimoSonido: null,
        }),
        false,
    );
});

test("callado no suena, y volver a encenderlo vuelve a sonar", () => {
    const base = { cuantosEsperan: 1, abroLaPuerta: true, ultimoSonido: null };
    assert.equal(tocaSonarEnLaPuerta({ ...base, silenciado: true }), false);
    assert.equal(tocaSonarEnLaPuerta({ ...base, silenciado: false }), true);
});

test("el rótulo distingue singular de plural, y con nadie no dice nada", () => {
    assert.equal(elAvisoDeLaPuerta(0), "");
    assert.match(elAvisoDeLaPuerta(1), /Alguien/);
    assert.match(elAvisoDeLaPuerta(3), /^3 personas/);
});

// ── El tono, contra los otros dos del producto ──────────────────────────────

test("el tono de la puerta NO se confunde con los otros dos: es el único que BAJA", () => {
    // Los números del de clientes, de `hooks/chats/useAdvisorNotifications`.
    const CLIENTES = { desde: 880, hasta: 1100, duracion: 0.45, volumen: 0.25 };
    assert.ok(CLIENTES.hasta > CLIENTES.desde, "el de clientes sube");
    assert.ok(TONO_DEL_EQUIPO.hasta > TONO_DEL_EQUIPO.desde, "el del equipo sube");
    assert.ok(TONO_DE_LA_PUERTA.hasta < TONO_DE_LA_PUERTA.desde, "y este BAJA");
});

test("y es el MÁS BAJO de los tres, porque es el único que se repite", () => {
    // Al volumen del de clientes, a la tercera vuelta habría que silenciarlo —
    // y entonces se silencia la pestaña entera y se pierden también los otros.
    assert.ok(TONO_DE_LA_PUERTA.volumen < TONO_DEL_EQUIPO.volumen);
    assert.ok(TONO_DE_LA_PUERTA.volumen < 0.25);
});

test("son dos golpes, como se llama a una puerta, y cortos", () => {
    assert.equal(TONO_DE_LA_PUERTA.golpes, 2);
    assert.ok(TONO_DE_LA_PUERTA.entreGolpes > TONO_DE_LA_PUERTA.duracion, "no se solapan");
    // Todo el aviso tiene que caber holgado dentro de su intervalo, o dejaría
    // de ser un aviso para ser un zumbido continuo.
    const todo = (TONO_DE_LA_PUERTA.golpes - 1) * TONO_DE_LA_PUERTA.entreGolpes +
        TONO_DE_LA_PUERTA.duracion;
    assert.ok(todo * 1000 < CADA_CUANTO_SUENA_LA_PUERTA_MS / 5, "menos del 20 % del intervalo");
});

// ── El barrido: una decisión y un camino, no dos ────────────────────────────

test("los DOS sitios que ofrecen los mandos salen de la misma decisión", () => {
    for (const f of ["components/video/PanelDeLaReunion.tsx", "components/video/SalaDeVideo.tsx"]) {
        assert.match(leer(f), /losMandosDeModeracion/, `${f} decide con la función compartida`);
    }
});

test("y del mismo camino: nadie vuelve a llamar a las acciones por su cuenta", () => {
    // Con el `try`/`catch` y el aviso escritos en cada sitio, al segundo se le
    // olvida uno — y eso se ve como un botón que no dice por qué no hizo nada.
    for (const f of ["components/video/PanelDeLaReunion.tsx", "components/video/RecuadrosDeLaSala.tsx"]) {
        const src = leer(f);
        assert.doesNotMatch(src, /silenciarAAction/, `${f} no llama a la acción a pelo`);
    }
    // Y el hook se monta UNA vez, arriba: con uno en cada sitio serían dos
    // estados de «hay algo en vuelo», y moderar desde el recuadro dejaría los
    // botones de la lista encendidos sobre alguien a quien ya se está sacando.
    assert.match(leer("components/video/SalaDeVideo.tsx"), /useModerarEnLaSala\(codigo\)/);
    assert.doesNotMatch(
        leer("components/video/PanelDeLaReunion.tsx"),
        /useModerarEnLaSala\(/,
        "el panel lo recibe, no lo monta",
    );
});

test("el aviso cuelga del reloj que ya existe: ni un sondeo nuevo a la sala", () => {
    const hook = leer("hooks/useAvisoDeLaPuerta.ts");
    // Su único reloj es el latido que pregunta, y solo existe con alguien en la
    // puerta: no hay ninguna petición nueva al servidor.
    assert.doesNotMatch(hook, /Action\(/, "no llama a ninguna acción de servidor");
    assert.doesNotMatch(hook, /fetch\(/, "ni pide nada por su cuenta");
});

test("un solo AudioContext, perezoso y reutilizado: abrir uno por pitido los agota", () => {
    // Cada `AudioContext` es un hilo de audio del sistema. Acumulándolos, el
    // navegador deja de dar más y entonces DEJA DE SONAR TODO.
    const hook = leer("hooks/useAvisoDeLaPuerta.ts");
    assert.match(hook, /^let contexto: AudioContext \| null = null;$/m, "a nivel de módulo");
    assert.equal((hook.match(/new Ctor\(\)/g) ?? []).length, 1);
    assert.match(hook, /contexto \?\?= new Ctor\(\)/, "reutilizado, no uno nuevo cada vez");
});

test("un fallo del sonido no es mudo: sin esto «a mí no me suena» no se explica", () => {
    assert.match(leer("hooks/useAvisoDeLaPuerta.ts"), /console\.warn\(/);
});
