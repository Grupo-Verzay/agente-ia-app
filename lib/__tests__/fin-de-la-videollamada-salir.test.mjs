// Las reglas puras del «Salir»: cuándo se termina la conversación de Tavus, y
// cuánto espera Tavus si se cae la conexión (ese rato lo cobra).
// Lo corre `scripts/banco-grabacion-completa.sh`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const F = await import("./.compilado/grabacion-completa/fin.js");

test("si se cae la conexión, Tavus espera UN minuto (antes tres, cobrados)", () => {
    assert.equal(F.ESPERA_SI_SE_CAE_S, 60);
    const servidor = readFileSync("lib/videollamada-ia.server.ts", "utf8");
    assert.match(servidor, /participant_left_timeout: ESPERA_SI_SE_CAE_S/);
    assert.doesNotMatch(servidor, /participant_left_timeout: 180/);
});

test("colgar a propósito sin nadie más termina la conversación; si queda alguien o la cerró Tavus, no", () => {
    for (const porque of ["salir", "limite", "despedida", "despedida-cliente-tope", "verzy-salio"]) {
        assert.equal(F.terminaLaConversacionAlColgar({ porque, quedanOtrasPersonas: false }), true, porque);
        assert.equal(F.terminaLaConversacionAlColgar({ porque, quedanOtrasPersonas: true }), false, `${porque} con alguien dentro`);
    }
    assert.equal(F.terminaLaConversacionAlColgar({ porque: "fin-de-tavus", quedanOtrasPersonas: false }), false);
});
