/**
 * Dos fallos de la sala de reunión, vistos en producción con dos participantes.
 *
 *   1. **La cámara apagada dejaba el último fotograma congelado.** Al apagar la
 *      cámara se hace `replaceTrack(null)` en el emisor, y la otra punta NO lo
 *      nota de forma fiable: la pista receptora se queda viva con el último
 *      fotograma, sin pasar a `muted`. Así que mirar solo la pista dejaba a los
 *      demás viendo a alguien que cree que ya no se le ve — un problema de
 *      privacidad. La decisión pasa a mandarla lo SEÑALIZADO (`camaraEncendida`
 *      / `compartiendo`, que viajan en el latido como el estado del micro), y la
 *      pista solo confirma que ha llegado algo.
 *
 *   2. **La franja de participantes no se podía esconder.** Ahora se pliega, y
 *      el estado se recuerda como el panel del #837. Al plegarla el orador
 *      —que es `flex-1`— ocupa el ancho liberado, porque la tira sale del
 *      reparto con `display:none` **sin desmontar sus `<video>`** (el audio no
 *      se corta).
 *
 * Este banco tiene dos mitades, como manda la casa:
 *
 *   - PURO, en dos modos: `hayVideoDelRemoto` con la lógica vieja (solo la
 *     pista) reproduce el congelado; con la nueva pinta el avatar. Sin el modo
 *     roto no se sabe si el verde de al lado prueba el arreglo o un caso que no
 *     se ejercía.
 *   - CABLEADO (lee el código real): que la malla usa la función nueva, que la
 *     tira se esconde con `hidden` **sin** dejar de renderizar sus recuadros, y
 *     que la pantalla recuerda el plegado y lo pasa a la rejilla.
 *
 * Compilar lo puro (sale en `.compilado/`, en .gitignore):
 *
 *   npx tsc -p lib/__tests__/tsconfig.banco.json
 *
 * Correr:  node --test lib/__tests__/camara-y-tira-de-la-sala.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    LLAVE_DE_LA_TIRA,
    comoSeGuardaLaTira,
    hayVideoDelRemoto,
    laTiraDeEntrada,
} from "./.compilado/lib/sala-de-video.js";

// ── Bug 1: la cámara apagada, y el modo roto que lo reproduce ────────────────

/** Cómo se decidía ANTES: solo la pista. Reproduce el fotograma congelado. */
const soloLaPista = (input) => input.pistaViva;

test("cámara apagada con la pista congelada: se pinta el AVATAR, no el fotograma", () => {
    // El caso exacto del fallo: la otra persona apagó la cámara, su latido ya
    // dice `camaraEncendida: false`, pero su pista sigue "viva" con el último
    // fotograma porque `replaceTrack(null)` no la marca `muted`.
    const congelada = {
        camaraEncendida: false,
        compartiendo: false,
        pistaViva: true,
    };
    // El modo roto: mirando solo la pista, seguía "habiendo video" → congelado.
    assert.equal(soloLaPista(congelada), true, "modo roto: el fotograma se queda");
    // El arreglo: manda lo señalizado → no hay video → iniciales.
    assert.equal(hayVideoDelRemoto(congelada), false, "ahora se pinta el avatar");
});

test("cámara encendida y la pista viva: sí se ve el video", () => {
    assert.equal(
        hayVideoDelRemoto({ camaraEncendida: true, compartiendo: false, pistaViva: true }),
        true,
    );
});

test("compartiendo pantalla cuenta como video aunque la cámara esté apagada", () => {
    // Al compartir, la cámara se apaga (una sola pista de video) pero sí hay
    // imagen que enseñar.
    assert.equal(
        hayVideoDelRemoto({ camaraEncendida: false, compartiendo: true, pistaViva: true }),
        true,
    );
});

test("dice que manda cámara pero la pista aún no llegó: iniciales, no negro", () => {
    // Está conectando: pintar un recuadro negro sería peor que el avatar.
    assert.equal(
        hayVideoDelRemoto({ camaraEncendida: true, compartiendo: false, pistaViva: false }),
        false,
    );
});

test("las dos condiciones hacen falta: sin señal Y sin pista, tampoco", () => {
    assert.equal(
        hayVideoDelRemoto({ camaraEncendida: false, compartiendo: false, pistaViva: false }),
        false,
    );
});

// ── Bug 2: lo que se recuerda de la tira ────────────────────────────────────

test("la tira arranca ABIERTA: no se esconde a nadie por defecto", () => {
    // Al revés que el panel del #837, que arranca plegado. La tira son las
    // caras de la gente; esconderlas por defecto sería empezar ocultando a
    // todos.
    assert.equal(laTiraDeEntrada(null), false);
    assert.equal(laTiraDeEntrada(undefined), false);
    assert.equal(laTiraDeEntrada("otra-cosa"), false, "un valor raro no la pliega");
});

test("plegar y desplegar se recuerda, ida y vuelta", () => {
    assert.equal(laTiraDeEntrada(comoSeGuardaLaTira(true)), true);
    assert.equal(laTiraDeEntrada(comoSeGuardaLaTira(false)), false);
});

// ── Cableado del código real ────────────────────────────────────────────────

const raiz = process.cwd();
const leer = (p) => readFileSync(join(raiz, p), "utf8");

const MALLA = "hooks/useMallaDeVideo.ts";
const RECUADROS = "components/video/RecuadrosDeLaSala.tsx";
const SALA = "components/video/SalaDeVideo.tsx";

test("la malla decide el video con hayVideoDelRemoto, no con la pista sola", () => {
    const src = leer(MALLA);
    assert.match(src, /hayVideoDelRemoto\s*\(/, "usa la función que gatea por lo señalizado");
    // Y ya no computa hayVideo directamente de `!video.muted` en el `map` de
    // los remotos: eso era el fotograma congelado.
    assert.doesNotMatch(
        src,
        /hayVideo:\s*Boolean\(video && !video\.muted/,
        "ya no decide hayVideo mirando solo la pista",
    );
});

test("la tira se esconde con `hidden` pero sus recuadros siguen montados", () => {
    const src = leer(RECUADROS);
    // Se esconde por CSS cuando va plegada.
    assert.match(src, /tiraPlegada\s*\?\s*"hidden"/, "plegada => display:none");
    // Y el `<video>` de la tira NO se desmonta: el `resto.map` se renderiza
    // pase lo que pase con `tiraPlegada`. Si alguien lo envolviera en
    // `{!tiraPlegada && ...}` se cortaría el audio de esa gente.
    assert.doesNotMatch(
        src,
        /!tiraPlegada\s*&&[\s\S]{0,120}resto\.map/,
        "los recuadros de la tira no se montan condicionados a tiraPlegada",
    );
    assert.match(src, /resto\.map\(/, "la tira sí renderiza a los demás");
});

test("la pantalla recuerda el plegado y se lo pasa a la rejilla", () => {
    const src = leer(SALA);
    assert.match(src, /LLAVE_DE_LA_TIRA/, "lee y escribe el recuerdo");
    assert.match(src, /laTiraDeEntrada\s*\(/, "lo carga al abrir");
    assert.match(src, /comoSeGuardaLaTira\s*\(/, "lo guarda por un solo sitio");
    assert.match(src, /tiraPlegada=\{tiraPlegada\}/, "se lo pasa a RecuadrosDeLaSala");
    // El botón de la cabecera para plegar/desplegar, solo en la vista de
    // orador (la única con tira).
    assert.match(src, /cambiarLaTira\(!tiraPlegada\)/, "el botón alterna");
    assert.match(src, /vistaDeAhora === "orador"/, "solo donde hay tira");
});
