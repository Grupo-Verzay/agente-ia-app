/**
 * Copia el segmentador de fondo a `public/`, antes de cada build.
 *
 * # Por qué no está en git, y por qué tampoco se pide a un CDN
 *
 * El desenfoque de fondo necesita un modelo que separe a la persona del resto
 * de la imagen. Eso son **6 MB** entre el wasm, el modelo y su cargador, y las
 * tres formas de tenerlos delante tienen un precio distinto:
 *
 * | | qué cuesta |
 * | --- | --- |
 * | commitearlos | 6 MB **permanentes** en el historial de git, para siempre y sin forma de sacarlos |
 * | pedirlos a un CDN | el día que la red de una oficina no deje salir a jsdelivr, el botón deja de funcionar y no hay nada que mirar |
 * | **copiarlos en el build** | la versión queda pinada en el lockfile, el historial sigue limpio y en producción se sirven desde nuestro propio dominio |
 *
 * Se eligió la tercera. La dependencia va con `--save-exact`, así que lo que se
 * copia es auditable; `public/segmentacion` está en `.gitignore`; y el
 * Dockerfile copia `public/` desde la etapa que ya corrió el build, así que en
 * la imagen final están.
 *
 * # Y falla RUIDOSAMENTE, a propósito
 *
 * Es lo único que hace que esto sea seguro. Si la copia fallara en silencio, el
 * build saldría verde, se desplegaría, y el fallo aparecería **la primera vez
 * que alguien pulsara el botón de desenfoque** — que es el sitio donde nadie
 * está mirando. Saliendo con error, el fallo aparece en el build, que es donde
 * se puede arreglar.
 *
 * # Solo la variante SIMD
 *
 * El paquete trae las dos, SIMD y sin SIMD, y son 5,7 MB cada una. WebAssembly
 * con SIMD lo tienen Chrome desde la 91, Firefox desde la 89 y Safari desde la
 * 16.4, o sea todo lo que hay hoy. Llevarse las dos sería duplicar el peso para
 * cubrir navegadores que ya no se usan, y el camino de fallo está cubierto: sin
 * SIMD el wasm no instancia y la pantalla lo dice con sus palabras en vez de
 * quedarse pensando.
 */

import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const desde = join(raiz, "node_modules", "@mediapipe", "selfie_segmentation");
const hasta = join(raiz, "public", "segmentacion");

/**
 * Los seis ficheros, con su porqué.
 *
 * El `.data` viene vacío (0 bytes) y aun así hace falta: el cargador lo pide
 * por su nombre y un 404 en mitad de la inicialización deja el segmentador
 * colgado sin decir nada. Un fichero de cero bytes que se sirve es distinto de
 * uno que no está.
 */
const FICHEROS = [
    "selfie_segmentation.js",
    "selfie_segmentation.binarypb",
    // El apaisado y no el cuadrado: esto segmenta fotogramas de video, que son
    // anchos. Con el cuadrado hay que recortar y se pierde a quien esté en un
    // lado de la imagen.
    "selfie_segmentation_landscape.tflite",
    "selfie_segmentation_solution_simd_wasm_bin.js",
    "selfie_segmentation_solution_simd_wasm_bin.wasm",
    "selfie_segmentation_solution_simd_wasm_bin.data",
];

async function main() {
    try {
        await stat(desde);
    } catch {
        // Sin el paquete no se puede copiar nada, y seguir sería dejar el botón
        // de desenfoque apuntando a seis 404.
        console.error(
            `[segmentacion] falta @mediapipe/selfie_segmentation en node_modules.\n` +
                `Se instala con: npm ci`,
        );
        process.exit(1);
    }

    await mkdir(hasta, { recursive: true });

    let bytes = 0;
    for (const f of FICHEROS) {
        const origen = join(desde, f);
        const destino = join(hasta, f);
        try {
            const info = await stat(origen);
            await copyFile(origen, destino);
            bytes += info.size;
        } catch (error) {
            console.error(`[segmentacion] no se pudo copiar ${f}:`, error);
            process.exit(1);
        }
    }

    console.log(
        `[segmentacion] ${FICHEROS.length} ficheros en public/segmentacion ` +
            `(${(bytes / 1048576).toFixed(1)} MB)`,
    );
}

await main();
