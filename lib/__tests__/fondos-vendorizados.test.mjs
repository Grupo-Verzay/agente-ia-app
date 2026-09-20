/**
 * Guardia de build: el modelo de segmentación del fondo tiene que estar.
 *
 * El #824 copia seis ficheros de `@mediapipe/selfie_segmentation` a
 * `public/segmentacion` en el `prebuild`, y el Dockerfile los mete en la imagen.
 * Si un cambio los dejara caer, el build seguiría verde y el fondo dejaría de
 * funcionar **en producción, en silencio** —que es justo lo que se investigó—.
 *
 * Este banco corre el vendorizado y afirma que los seis quedan con un tamaño
 * cuerdo. Es barato y no necesita navegador; el que prueba que el modelo de
 * verdad SEGMENTA es `fondo-cambia-el-sender.test.mjs`.
 *
 *   node --test lib/__tests__/fondos-vendorizados.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = join(raiz, "public", "segmentacion");

// El mismo mínimo que garantiza que no es un fichero vacío o un 404 guardado
// como texto. El `.data` viene a 0 bytes a propósito (ver el script), así que
// ese solo tiene que EXISTIR.
const ESPERADOS = [
    ["selfie_segmentation.js", 10_000],
    ["selfie_segmentation.binarypb", 100],
    ["selfie_segmentation_landscape.tflite", 100_000],
    ["selfie_segmentation_solution_simd_wasm_bin.js", 50_000],
    ["selfie_segmentation_solution_simd_wasm_bin.wasm", 1_000_000],
    ["selfie_segmentation_solution_simd_wasm_bin.data", -1],
];

test("el prebuild deja los seis ficheros del modelo, con tamaño cuerdo", () => {
    // Corre el MISMO script que el build, para probar lo que se desplegaría.
    execFileSync("node", [join(raiz, "scripts", "vendorizar-segmentacion.mjs")], {
        stdio: "pipe",
    });
    for (const [nombre, minimo] of ESPERADOS) {
        const info = statSync(join(dir, nombre));
        if (minimo < 0) {
            assert.ok(info.isFile(), `${nombre} tiene que existir (aunque sea de 0 bytes)`);
        } else {
            assert.ok(
                info.size >= minimo,
                `${nombre} pesa ${info.size}, esperaba al menos ${minimo}`,
            );
        }
    }
});
