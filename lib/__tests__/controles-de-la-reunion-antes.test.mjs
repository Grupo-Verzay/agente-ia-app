/**
 * El «antes» de los tres controles, pinchado a un commit.
 *
 * Esto es lo que corre en `MODO=roto`, y afirma el fallo tal como se reportó.
 * Sin él, lo verde del banco de al lado no diría si se arregló la causa o si
 * el caso no se llega a ejercer.
 *
 * **El «antes» va PINCHADO a un commit, nunca a `origin/main`.** En cuanto
 * esto se fusione, `origin/main` pasa a ser el «después»: el modo roto dejaría
 * de reproducir nada y **se pondría verde sin ejercer el fallo**, que es la
 * peor forma de tener un banco. Este repositorio ya lo pagó una vez con los
 * paneles flotantes.
 *
 * El commit está en `el-antes-de-los-controles.json`, al lado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { commit } = JSON.parse(
    readFileSync(new URL("./el-antes-de-los-controles.json", import.meta.url), "utf8"),
);

const antes = (ruta) => {
    try {
        return execFileSync("git", ["show", `${commit}:${ruta}`], { encoding: "utf8" });
    } catch {
        return null;
    }
};

test("ANTES: no existía ninguna decisión compartida de qué se puede moderar", () => {
    assert.equal(antes("lib/moderar-en-la-sala.ts"), null);
});

test("ANTES: el panel decidía a mano, en el único sitio que los ofrecía", () => {
    const panel = antes("components/video/PanelDeLaReunion.tsx");
    assert.ok(panel, "el panel existía");
    assert.match(
        panel,
        /moderas && !quien\.soyYo/,
        "la condición estaba escrita a mano dentro de la fila",
    );
    assert.doesNotMatch(panel, /losMandosDeModeracion/);
});

test("ANTES: el RECUADRO de la persona no ofrecía ningún mando", () => {
    // Este es el fallo tal como se vive: se está mirando a quien sobra de la
    // reunión anterior y no hay nada que pulsar encima de él. Los mandos
    // existían, pero detrás del panel lateral —que nace plegado— y de su
    // pestaña «Gente».
    const recuadros = antes("components/video/RecuadrosDeLaSala.tsx");
    assert.ok(recuadros, "el componente existía");
    assert.doesNotMatch(recuadros, /moderacion/i, "no recibía nada de moderación");
    assert.doesNotMatch(recuadros, /DropdownMenu/, "ni tenía ningún menú");
    assert.doesNotMatch(recuadros, /UserX/, "ni el icono de sacar");
});

test("ANTES: el panel nace PLEGADO y en la pestaña del chat, así que no se veían", () => {
    const sala = antes("components/video/SalaDeVideo.tsx");
    assert.ok(sala);
    assert.match(
        sala,
        /useState<PestanaDelPanel>\("chat"\)/,
        "abre en «chat», no en «gente»",
    );
    assert.match(
        sala,
        /useState<PestanaDelPanel \| null>\(null\)/,
        "y el panel arranca sin abrir",
    );
});

test("ANTES: la sala de espera era SOLO visual, sin un solo sonido", () => {
    assert.equal(antes("lib/aviso-de-la-puerta.ts"), null);
    assert.equal(antes("hooks/useAvisoDeLaPuerta.ts"), null);
    const sala = antes("components/video/SalaDeVideo.tsx");
    assert.match(sala, /personas esperan para entrar/, "la franja sí estaba");
    assert.doesNotMatch(sala, /AudioContext/, "y no sonaba nada");
});

test("ANTES: en TODO el módulo de video no había ningún tono de aviso", () => {
    for (const f of [
        "components/video/SalaDeVideo.tsx",
        "components/video/RecuadrosDeLaSala.tsx",
        "components/video/PanelDeLaReunion.tsx",
        "hooks/useMallaDeVideo.ts",
    ]) {
        const src = antes(f);
        assert.ok(src, `${f} existía`);
        assert.doesNotMatch(src, /createOscillator/, `${f} no hacía sonar nada`);
    }
});

test("ANTES: con la reunión plegada no había forma de saber que llamaban", () => {
    const sala = antes("components/video/SalaDeVideo.tsx");
    // La pastilla ya decía si se grababa y si se estaba reconectando, pero no
    // que hubiera alguien en la puerta.
    const pastilla = sala.slice(sala.indexOf("if (minimizada)"), sala.indexOf("if (minimizada)") + 3000);
    assert.match(pastilla, /malla\.grabando/, "sí decía que se graba");
    assert.doesNotMatch(pastilla, /esperan/i, "y no decía nada de la puerta");
});
