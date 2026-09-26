/**
 * El COPY del anuncio: la decisión pura y un barrido del código.
 *
 * La regla que se ejerce aquí, y de la que cuelga el resto: **la red sale del
 * FORMATO de la vista previa**, no de un mando nuevo. Y su pareja: **lo que una
 * red no soporta se quita al LEER, no solo se pide en el prompt** — pedirle al
 * modelo que no ponga hashtags en una historia de WhatsApp es una instrucción
 * que a veces se ignora, y «casi siempre» no basta.
 *
 * El barrido comprueba lo que una prueba pura no puede: que la pantalla no
 * escribió su propia copia de nada —ni la llave de la vista, ni la lectura de
 * los rechazos de Gemini, ni la lista de redes—, que la acción usa la MISMA
 * clave que ya configura esa pantalla, y que el panel se pinta junto a la vista
 * previa con sus dos botones.
 *
 * `MODO=roto` lee los ficheros del commit anterior (`ANTES_REF`). Ahí no había
 * copy en absoluto, así que lo que afirma es justo eso: ni módulo, ni acción,
 * ni panel — y la pantalla generaba la imagen y nada más.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
    LAS_REDES,
    comoSeLeeElCopy,
    instruccionesDelCopy,
    laLlaveDeLaVista,
    laRedDelFormato,
    loQueCabeTodavia,
    porQueFalloGemini,
    recortarSinPartirPalabras,
} from "./.compilado/copy/copy-del-anuncio.js";

const ROTO = process.env.MODO === "roto";
/** El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
 *  fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin
 *  reproducir nada, que es la peor forma de tener un banco. */
const ANTES_REF = process.env.ANTES_REF || "121e369";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function leer(fichero) {
    if (ROTO) {
        // Un fichero que no existía antes se lee vacío: es justo lo que faltaba.
        try {
            return execFileSync("git", ["show", `${ANTES_REF}:${fichero}`], {
                cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
            });
        } catch {
            return "";
        }
    }
    const p = path.join(RAIZ, fichero);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

/* ── La decisión ────────────────────────────────────────────────────────── */

test("la red sale del formato de la vista previa", () => {
    assert.equal(laRedDelFormato("1:1"), "instagram");
    assert.equal(laRedDelFormato("9:16"), "whatsapp");
    assert.equal(laRedDelFormato("16:9"), "facebook");
    // Nunca se queda sin red: sin ella no habría copy que generar, y un panel
    // vacío se lee como que la función no existe.
    assert.equal(laRedDelFormato("4:5"), "instagram");
    assert.equal(laRedDelFormato(undefined), "instagram");
    assert.equal(laRedDelFormato(null), "instagram");
});

test("las tres redes son las tres de la vista previa, con sus nombres", () => {
    assert.deepEqual(Object.keys(LAS_REDES).sort(), ["facebook", "instagram", "whatsapp"]);
    assert.equal(LAS_REDES.instagram.nombre, "Post Instagram");
    assert.equal(LAS_REDES.whatsapp.nombre, "Story / WhatsApp");
    assert.equal(LAS_REDES.facebook.nombre, "Post Facebook");
});

test("hashtags: Instagram sí, Facebook pocos, WhatsApp NINGUNO", () => {
    assert.ok(LAS_REDES.instagram.hashtags >= 5);
    assert.ok(LAS_REDES.facebook.hashtags > 0 && LAS_REDES.facebook.hashtags < LAS_REDES.instagram.hashtags);
    // Cero no es un olvido: WhatsApp no los indexa.
    assert.equal(LAS_REDES.whatsapp.hashtags, 0);
});

test("una historia de WhatsApp es más corta que un post", () => {
    assert.ok(LAS_REDES.whatsapp.topeDeCaracteres < LAS_REDES.instagram.topeDeCaracteres);
    assert.ok(LAS_REDES.instagram.topeDeCaracteres < LAS_REDES.facebook.topeDeCaracteres);
});

test("el prompt pide llamado a la acción SIEMPRE, y hashtags solo donde cuentan", () => {
    for (const formato of ["1:1", "9:16", "16:9"]) {
        const p = instruccionesDelCopy({ formato });
        assert.match(p, /llamado a la acción/i, `sin CTA en ${formato}`);
        assert.ok(p.includes(LAS_REDES[laRedDelFormato(formato)].nombre), `sin la red en ${formato}`);
        // No inventar precios ni garantías: el modelo no tiene por qué saberlos.
        assert.match(p, /NO inventes precios/);
    }
    assert.match(instruccionesDelCopy({ formato: "1:1" }), /6 hashtags/);
    assert.match(instruccionesDelCopy({ formato: "16:9" }), /2 hashtags/);
    assert.match(instruccionesDelCopy({ formato: "9:16" }), /NO escribas hashtags/);
});

test("el prompt lleva el producto: plantilla, estilo, detalles y ADN", () => {
    const p = instruccionesDelCopy({
        formato: "1:1",
        plantilla: "8. Oferta Irresistible — Descuentos y combos.",
        estilo: "Iluminacion de lujo y texturas de alta gama.",
        detalles: "Reloj de acero, envío gratis a todo el país",
        adn: "Mesa de mármol negro",
    });
    assert.ok(p.includes("Oferta Irresistible"));
    assert.ok(p.includes("texturas de alta gama"));
    assert.ok(p.includes("envío gratis a todo el país"));
    assert.ok(p.includes("Mesa de mármol negro"));
    // Sin datos, no se finge que los hay.
    assert.match(instruccionesDelCopy({ formato: "1:1" }), /No hay datos adicionales/);
});

test("al leer: en WhatsApp los hashtags se QUITAN aunque el modelo los ponga", () => {
    const crudo = "Llévatelo hoy 🔥\nEscríbenos por aquí.\n#Ofertas #Envios #Colombia";
    const leido = comoSeLeeElCopy(crudo, "9:16");
    assert.equal(leido.includes("#Ofertas"), false);
    assert.equal(leido.includes("#"), false);
    assert.ok(leido.includes("Escríbenos por aquí."));
    // Y en Instagram se quedan: ahí sí traen gente.
    assert.ok(comoSeLeeElCopy(crudo, "1:1").includes("#Ofertas"));
});

test("«el #1 en ventas» NO es un hashtag", () => {
    // Sin la condición de que lleve una letra, quitar los hashtags de una
    // historia se llevaría por delante parte de la frase.
    const leido = comoSeLeeElCopy("Somos el #1 en ventas. Escríbenos.", "9:16");
    assert.ok(leido.includes("#1"), leido);
});

test("al leer: se quita la envoltura con la que el modelo a veces contesta", () => {
    assert.equal(comoSeLeeElCopy('```\nHola mundo\n```', "1:1"), "Hola mundo");
    assert.equal(comoSeLeeElCopy('```markdown\nHola mundo\n```', "1:1"), "Hola mundo");
    assert.equal(comoSeLeeElCopy('"Hola mundo"', "1:1"), "Hola mundo");
    assert.equal(comoSeLeeElCopy('«Hola mundo»', "1:1"), "Hola mundo");
    // Una comilla que es del texto no se toca.
    assert.equal(comoSeLeeElCopy('Dijo "gracias" y se fue', "1:1"), 'Dijo "gracias" y se fue');
});

test("al leer: nada de crudo vacío, y los renglones en blanco no se acumulan", () => {
    assert.equal(comoSeLeeElCopy(null, "1:1"), "");
    assert.equal(comoSeLeeElCopy(undefined, "1:1"), "");
    assert.equal(comoSeLeeElCopy("  ", "1:1"), "");
    assert.equal(comoSeLeeElCopy("uno\n\n\n\n\ndos", "1:1"), "uno\n\ndos");
});

test("el recorte no parte una palabra por la mitad", () => {
    const largo = "palabra ".repeat(200).trim();
    const leido = comoSeLeeElCopy(largo, "9:16");
    assert.ok(leido.length <= LAS_REDES.whatsapp.topeDeCaracteres);
    // Un texto cortado a hueso se lee como un fallo.
    assert.ok(leido.endsWith("palabra"), leido.slice(-20));
    assert.equal(recortarSinPartirPalabras("hola", 99), "hola");
    // Una sola palabra más larga que el tope sí se corta: no hay dónde partir.
    assert.equal(recortarSinPartirPalabras("aaaaaaaaaa", 4), "aaaa");
});

test("loQueCabeTodavia dice cuánto falta para pasarse", () => {
    assert.equal(loQueCabeTodavia("", "9:16"), LAS_REDES.whatsapp.topeDeCaracteres);
    assert.ok(loQueCabeTodavia("x".repeat(400), "9:16") < 0);
});

test("la llave de una vista es UNA, y junta plantilla y formato", () => {
    assert.equal(laLlaveDeLaVista("hero", "9:16"), "hero_9:16");
});

test("por qué falló Gemini: cada causa con su mensaje, y lo raro NO es mudo", () => {
    assert.equal(porQueFalloGemini(new Error("Falta la API key de Gemini. Configura…")).causa, "sin_clave");
    assert.equal(porQueFalloGemini(new Error("PERMISSION_DENIED")).causa, "clave_rechazada");
    assert.equal(porQueFalloGemini(new Error("API key not valid")).causa, "clave_rechazada");
    assert.equal(porQueFalloGemini(new Error("429 quota exceeded")).causa, "cuota");
    for (const c of ["sin_clave", "clave_rechazada", "cuota"]) {
        const r = porQueFalloGemini(new Error(c === "cuota" ? "429" : c === "sin_clave" ? "Falta la API key de Gemini" : "PERMISSION_DENIED"));
        assert.equal(r.detiene, true, c);
    }
    const raro = porQueFalloGemini(new Error("ECONNRESET"));
    assert.equal(raro.causa, "desconocida");
    assert.equal(raro.detiene, false);
    // Lo que no se reconoce lleva el detalle dentro: un fallo sin mensaje se ve
    // como una imagen que no salió y nadie sabe por qué.
    assert.ok(raro.mensaje.includes("ECONNRESET"), raro.mensaje);
    assert.ok(porQueFalloGemini(null).mensaje.trim().length > 0);
});

/* ── El barrido ─────────────────────────────────────────────────────────── */

const MODULO = leer("lib/copy-del-anuncio.ts");
const ACCION = leer("actions/ai-image-actions.ts");
const HOOK = leer("app/(root)/ai-image/_components/hooks/useAdGenerator.ts");
const PANEL = leer("app/(root)/ai-image/_components/AdCopyPanel.tsx");
const ESTUDIO = leer("app/(root)/ai-image/_components/AdGeneratorStudio.tsx");

test("existe la generación del copy: módulo, acción y panel", () => {
    if (ROTO) {
        // Antes la pantalla generaba la imagen y NADA de texto.
        assert.equal(MODULO, "", "en el «antes» no había módulo del copy");
        assert.equal(PANEL, "", "en el «antes» no había panel del texto");
        assert.equal(ACCION.includes("generarCopyDelAnuncio"), false, "en el «antes» no había acción");
        assert.equal(HOOK.includes("pedirElCopy"), false, "en el «antes» el ciclo no pedía ningún texto");
        return;
    }
    assert.ok(MODULO.length > 0);
    assert.ok(ACCION.includes("export async function generarCopyDelAnuncio"));
    assert.ok(PANEL.includes("AdCopyPanel"));
});

test("la acción usa la MISMA clave de Gemini que ya configura la pantalla", () => {
    if (ROTO) return;
    const cuerpo = ACCION.slice(ACCION.indexOf("export async function generarCopyDelAnuncio"));
    // `getGeminiApiKey` es la que lee `userAiConfig` del proveedor google: la
    // que guarda el diálogo de esa misma pantalla. Una segunda credencial sería
    // una más que configurar.
    assert.ok(cuerpo.includes("await getGeminiApiKey()"), "no pasa por getGeminiApiKey");
    assert.equal(/process\.env\.\w*(GEMINI|GOOGLE)/.test(cuerpo), false, "se busca la clave en el entorno");
});

test("la acción NO lanza: devuelve el motivo", () => {
    if (ROTO) return;
    const cuerpo = ACCION.slice(ACCION.indexOf("export async function generarCopyDelAnuncio"));
    assert.ok(cuerpo.includes("catch"), "sin catch, un fallo del texto tumbaría la tanda de imágenes");
    assert.equal(/\bthrow\b/.test(cuerpo), false, "lanza en vez de devolver el motivo");
    // Y no es mudo.
    assert.ok(cuerpo.includes("console.warn"), "un copy que no sale sin decir por qué se lee como que no existe");
});

test("la llave de la vista se escribe en UN sitio", () => {
    if (ROTO) return;
    // Con dos formas de construirla, el panel enseñaría el texto de otra vista
    // sin dar ningún error.
    assert.equal(
        /`\$\{[^`]*\}_\$\{[^`]*\}`/.test(HOOK), false,
        "el hook vuelve a montar la llave a mano en vez de usar laLlaveDeLaVista"
    );
    assert.ok(HOOK.includes("laLlaveDeLaVista("));
});

test("por qué falló Gemini lo lee UNA función, también en el ciclo de imágenes", () => {
    if (ROTO) {
        assert.ok(HOOK.includes("permission_denied"), "en el «antes» el ciclo llevaba su propia lista");
        return;
    }
    assert.ok(HOOK.includes("porQueFalloGemini("), "el ciclo de imágenes no usa la función común");
    assert.equal(HOOK.includes("unregistered callers"), false, "quedó una segunda copia de la lista de rechazos");
});

test("un fallo desconocido del ciclo de imágenes ya NO es mudo", () => {
    if (ROTO) return;
    const captura = HOOK.slice(HOOK.indexOf("catch (err: unknown)"), HOOK.indexOf("const primera"));
    // Antes este `catch` se acababa sin escribir nada cuando el error no
    // encajaba en ninguno de los tres casos conocidos.
    assert.ok(captura.includes("setError(mensaje)"), "el catch vuelve a rendirse en silencio");
});

test("el copy se pide DETRÁS de la imagen y solo si alguna salió", () => {
    if (ROTO) return;
    assert.ok(HOOK.includes("if (primera) await pedirElCopy("), "se pide el texto sin imagen que describir");
});

test("los copies se reindexan igual que las imágenes al quitar un producto", () => {
    if (ROTO) return;
    // Si no, al quitar el producto 1 el texto del 2 se quedaría debajo de la
    // imagen del 3.
    assert.ok(HOOK.includes("setCopies((prev) => reindexarSinEl(prev, index))"));
    assert.ok(HOOK.includes("setGeneratedImages((prev) => reindexarSinEl(prev, index))"));
});

test("el panel va JUNTO a la vista previa, y es editable, copiable y regenerable", () => {
    if (ROTO) {
        assert.equal(ESTUDIO.includes("AdCopyPanel"), false);
        return;
    }
    assert.ok(ESTUDIO.includes("<AdCopyPanel"), "el panel no se pinta en el estudio");
    // En la MISMA columna que la vista previa, no en otro sitio de la pantalla.
    const columna = ESTUDIO.slice(ESTUDIO.indexOf("<AdPreviewPanel"));
    assert.ok(columna.includes("<AdCopyPanel"), "el panel no está junto a la vista previa");

    assert.ok(PANEL.includes('data-panel="copy-del-anuncio"'), "sin la marca, el banco de navegador no lo encuentra");
    assert.ok(PANEL.includes("<Textarea"), "el texto no se puede editar");
    assert.ok(PANEL.includes("onCopyChange"), "lo editado no vuelve a quien lo guarda");
    assert.ok(PANEL.includes('data-boton="copiar-copy"'), "falta el botón de copiar");
    assert.ok(PANEL.includes('data-boton="regenerar-copy"'), "falta el botón de volver a generar");
    assert.ok(PANEL.includes("clipboard.writeText"));
    // Copiar puede lanzar en un origen sin HTTPS: un botón que da error al
    // pulsarlo es peor que no tenerlo.
    assert.ok(PANEL.includes("catch"), "copiar no contempla que el navegador lo niegue");
});

test("la red del panel sale del formato de la previa, no de un mando nuevo", () => {
    if (ROTO) return;
    assert.ok(PANEL.includes("laRedDelFormato("), "el panel decide la red por su cuenta");
    assert.ok(ESTUDIO.includes("previewFormat={studio.previewFormat}"));
    // Nada de un segundo selector de red dentro del panel.
    assert.equal(/onSelectRed|setRed\b/.test(PANEL), false, "hay un segundo mando de red");
});

test("el modelo del copy es de TEXTO, no uno de los de imagen del paso Motor", () => {
    if (ROTO) return;
    const modelo = ACCION.match(/const MODELO_DEL_COPY = "([^"]+)"/);
    assert.ok(modelo, "el modelo del copy no está escrito en un solo sitio");
    assert.equal(modelo[1].includes("image"), false, `${modelo[1]} es un generador de imagen`);
});
