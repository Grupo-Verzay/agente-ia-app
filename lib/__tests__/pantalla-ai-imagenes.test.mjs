/**
 * Lo que se ARREGLÓ en la pantalla de AI Imágenes (`/ai-image`) al documentarla.
 *
 * Fotografiar la pantalla paso a paso destapó fallos que desde dentro no se
 * veían, y ninguno daba un error:
 *
 * 1. **El segundo paso se llamaba «imagen»** en la barra de pasos: el único de
 *    los cuatro con un nombre que no dice lo que hay dentro (es la Campaña).
 * 2. **Los avisos de la API key mandaban a Mi Perfil**, donde no se puede poner
 *    (Perfil solo ofrece OpenAI). Ahora mandan a «Configurar» de esta pantalla,
 *    y sin clave el botón del último paso la configura en vez de lanzar una
 *    tanda que solo podía volver con un error.
 * 3. **Todo viajaba como PNG**: la foto del producto (casi siempre un JPEG) se
 *    le mandaba a Google diciendo que era un PNG, y la descarga salía `.png`
 *    aunque Gemini devolviera un JPEG. Ahora cada imagen lleva SU tipo
 *    (`lib/imagen-en-base64.ts`).
 * 4. **Borrar un estilo propio** era un clic en una papelera de 24 px pegada al
 *    nombre, sin confirmación, y se quitaba de la pantalla aunque el servidor
 *    dijera que no. Ahora pregunta con el nombre delante, y si falla vuelve a
 *    su sitio y se dice. Con papelera, el chulito del elegido ya no se monta
 *    encima de ella.
 * 5. **Guardar una clave vacía o un estilo sin nombre** se aceptaba en el
 *    servidor. Y los dos `catch` de la página eran mudos.
 * 6. **Tildes**: «Iluminacion», «Direccion actual», «Lo que se generara»…
 * 7. **Los nombres de las etapas se cortaban con «…»** («Identificación del
 *    pro…»): el rótulo iba en una línea con `truncate`. Ahora parte en dos.
 * 8. **La vista previa recortaba el anuncio**: la caja se estira con el panel y
 *    la imagen iba `object-cover`, así que de un anuncio 9:16 se veía una tira
 *    del centro. Ahora `object-contain`: el anuncio se ve entero.
 * 9. **«1 cuenta asociadas»** arriba del menú, en todas las pantallas: el
 *    adjetivo no concordaba con el número.
 *
 * `MODO=roto` lee los mismos ficheros de `ANTES_AI_IMAGENES_REF` —pinchado a un
 * commit, nunca `origin/main`— y AFIRMA cada fallo. Sin ese modo no se sabría
 * si lo verde de al lado es que se arregló la causa o que el caso no se ejerce.
 *
 * Se levanta con `scripts/banco-guia-ai-imagenes.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_AI_IMAGENES_REF ?? "ab6b110";

const C = "app/(root)/ai-image/_components";
const leer = (rel) =>
    ROTO
        ? (() => {
              try {
                  return execSync(`git show ${ANTES}:${JSON.stringify(rel)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
              } catch {
                  return "";
              }
          })()
        : readFileSync(path.join(RAIZ, rel), "utf8");

/** Los dos `catch` que no dicen nada: `catch {` con solo un comentario dentro. */
const CATCH_MUDO = /catch\s*\{\s*(\/\*[^*]*\*\/)?\s*\}/;

/** Palabras que en la pantalla salían sin su tilde. */
const SIN_TILDE = /\b(Iluminacion|artisticas|solucion|Identificacion|Presentacion|Transformacion|Demostracion|garantias|Accion|Seccion|politicas|Rapido|versatil|mayoria|Maximo|Descripcion|iluminacion|Direccion|generara|Aun no hay|mas imagenes)\b/;

if (ROTO) {
    test("ANTES: el segundo paso se llamaba «imagen»", () => {
        assert.match(leer(`${C}/ad-generator.constants.ts`), /id: 'campaign', label: 'imagen'/);
    });

    test("ANTES: los avisos de la clave mandaban a Mi Perfil y sin clave se generaba igual", () => {
        assert.match(leer("actions/ai-image-actions.ts"), /Configura tu clave de Google en Mi Perfil/);
        assert.match(leer("lib/copy-del-anuncio.ts"), /Ve a Mi Perfil para agregarla/);
        assert.doesNotMatch(leer(`${C}/StepFooter.tsx`), /sinClave|Configurar API key/, "el pie ya sabía de la clave");
    });

    test("ANTES: todo viajaba como PNG, fuera lo que fuera", () => {
        const accion = leer("actions/ai-image-actions.ts");
        assert.match(accion, /mimeType: "image\/png"/);
        assert.match(accion, /return `data:image\/png;base64,/);
        assert.match(leer(`${C}/hooks/useAdGenerator.ts`), /\.png`/);
        assert.equal(leer("lib/imagen-en-base64.ts"), "");
    });

    test("ANTES: borrar un estilo no pedía confirmación ni se deshacía si fallaba", () => {
        assert.doesNotMatch(leer(`${C}/steps/StepStyle.tsx`), /AlertDialog/);
        const hook = leer(`${C}/hooks/useAdGenerator.ts`);
        assert.match(hook, /await deleteUserVisualStyle\(id\)\n\s*setCustomStyles\(\(prev\) => prev\.filter/, "el estilo se quitaba pasara lo que pasara");
    });

    test("ANTES: la clave vacía y el estilo sin nombre pasaban, y la página callaba sus fallos", () => {
        const accion = leer("actions/ai-image-actions.ts");
        assert.doesNotMatch(accion, /Escribe tu API key de Google/);
        assert.doesNotMatch(accion, /El estilo necesita un nombre/);
        assert.match(leer("app/(root)/ai-image/page.tsx"), CATCH_MUDO);
    });

    test("ANTES: los nombres de las etapas se cortaban y la vista previa recortaba el anuncio", () => {
        assert.match(leer(`${C}/steps/StepCampaign.tsx`), /<span className="truncate text-xs font-medium">\{label\}<\/span>/);
        assert.match(leer(`${C}/AdPreviewPanel.tsx`), /object-cover/);
    });

    test("ANTES: el menú decía «1 cuenta asociadas»", () => {
        const menu = leer("components/AccountSwitcher.tsx");
        assert.match(menu, /count === 1 \? "1 cuenta" :/);
        assert.match(menu, /\{getAccountCountLabel\(accessibleCount\)\} asociadas<\/span>/);
    });

    test("ANTES: la pantalla tenía palabras sin tilde", () => {
        const todo = ["ad-generator.constants.ts", "steps/StepEngine.tsx", "steps/StepStyle.tsx", "AdPreviewPanel.tsx"].map((f) => leer(`${C}/${f}`)).join("\n");
        assert.match(todo, SIN_TILDE);
    });
} else {
    const img = await import(path.join(RAIZ, "lib/__tests__/.compilado/pantalla-ai-imagenes/imagen-en-base64.mjs"));
    const copy = await import(path.join(RAIZ, "lib/__tests__/.compilado/pantalla-ai-imagenes/copy-del-anuncio.mjs"));

    test("el segundo paso se llama Campaña, como su sección", () => {
        const c = leer(`${C}/ad-generator.constants.ts`);
        assert.match(c, /id: 'campaign', label: 'Campaña'/);
        assert.doesNotMatch(c, /label: 'imagen'/);
    });

    test("la clave se pone con «Configurar» de esta pantalla, y sin clave el último paso la configura", () => {
        const accion = leer("actions/ai-image-actions.ts");
        assert.doesNotMatch(accion, /"[^"\n]*Mi Perfil[^"\n]*"/, "un aviso de la acción todavía manda a Mi Perfil");
        // El mensaje sigue empezando como lo reconoce `porQueFalloGemini`.
        const mensaje = /const FALTA_LA_CLAVE = "([^"]+)"/.exec(accion)?.[1];
        assert.ok(mensaje, "no hay un mensaje único para la clave que falta");
        const causa = copy.porQueFalloGemini(new Error(mensaje));
        assert.equal(causa.causa, "sin_clave");
        assert.match(causa.mensaje, /Configurar/);
        assert.match(copy.porQueFalloGemini(new Error("API key not valid")).mensaje, /Cambiar/);
        const pie = leer(`${C}/StepFooter.tsx`);
        assert.match(pie, /isLastStep && sinClave \?/);
        assert.match(pie, /Configurar API key/);
        assert.match(leer(`${C}/AdGeneratorStudio.tsx`), /sinClave=\{!keyConfigured\}/);
    });

    test("cada imagen viaja con SU tipo, y la descarga lleva su extensión", () => {
        assert.deepEqual(img.partirLaImagen("data:image/jpeg;base64,/9j/AAA"), { tipo: "image/jpeg", datos: "/9j/AAA" });
        assert.deepEqual(img.partirLaImagen("data:image/jpg;base64,AAA"), { tipo: "image/jpeg", datos: "AAA" });
        assert.deepEqual(img.partirLaImagen("data:image/webp;base64,UklG"), { tipo: "image/webp", datos: "UklG" });
        // Lo que no es una imagen cae en PNG; lo que no es un data: no trae datos.
        assert.equal(img.partirLaImagen("data:text/html;base64,PGI+").tipo, "image/png");
        assert.deepEqual(img.partirLaImagen("https://otro.com/x.png"), { tipo: "image/png", datos: "" });
        assert.deepEqual(img.partirLaImagen(null), { tipo: "image/png", datos: "" });
        assert.equal(img.partirLaImagen("data:image/png;base64,AB\nCD").datos, "AB\nCD");
        assert.equal(img.comoDataUrl("AAA", "image/jpeg"), "data:image/jpeg;base64,AAA");
        assert.equal(img.comoDataUrl("AAA", undefined), "data:image/png;base64,AAA");
        assert.equal(img.laExtensionDeLaImagen("data:image/jpeg;base64,AAA"), "jpg");
        assert.equal(img.laExtensionDeLaImagen("data:image/webp;base64,AAA"), "webp");
        assert.equal(img.laExtensionDeLaImagen("nada"), "png");
        // Y la acción y la descarga pasan por ahí: no queda ningún PNG a mano.
        const accion = leer("actions/ai-image-actions.ts");
        assert.doesNotMatch(accion, /mimeType: "image\/png"/);
        assert.doesNotMatch(accion, /`data:image\/png;base64,/);
        assert.doesNotMatch(accion, /\.split\(","\)\[1\]/);
        const hook = leer(`${C}/hooks/useAdGenerator.ts`);
        assert.match(hook, /laExtensionDeLaImagen\(img\)/);
        assert.doesNotMatch(hook, /-v\$\{[^}]+\}\.png`/);
    });

    test("borrar un estilo propio pide confirmación, y si el servidor dice que no, vuelve", () => {
        const estilo = leer(`${C}/steps/StepStyle.tsx`);
        assert.match(estilo, /AlertDialog/);
        assert.match(estilo, /data-boton="confirmar-borrar-estilo"/);
        assert.match(estilo, /setPorBorrar\(style\)/, "la papelera borra directamente");
        // El chulito del elegido no va en la esquina de la papelera.
        assert.match(estilo, /style\.canDelete \? 'right-10' : 'right-3'/);
        const hook = leer(`${C}/hooks/useAdGenerator.ts`);
        const borrar = hook.slice(hook.indexOf("const deleteCustomStyle"), hook.indexOf("const deleteCustomStyle") + 1400);
        assert.ok(borrar.indexOf("setCustomStyles((prev) => prev.filter") < borrar.indexOf("await deleteUserVisualStyle"), "no se pinta al momento");
        assert.match(borrar, /\[\.\.\.prev\.slice\(0, posicion\), estilo, \.\.\.prev\.slice\(posicion\)\]/, "un fallo no devuelve el estilo a su sitio");
        assert.match(borrar, /toast\.error/, "un fallo no se dice");
        // Y guardar uno que falla también se dice.
        assert.match(hook.slice(hook.indexOf("const addCustomStyle"), hook.indexOf("const deleteCustomStyle")), /toast\.error/);
    });

    test("el servidor no guarda una clave vacía ni un estilo sin nombre, y la página no calla sus fallos", () => {
        const accion = leer("actions/ai-image-actions.ts");
        assert.match(accion, /apiKey = \(apiKey \?\? ""\)\.trim\(\);\s*if \(!apiKey\) return \{ success: false/);
        assert.match(accion, /if \(!name\?\.trim\(\) \|\| !description\?\.trim\(\)\)/);
        const pagina = leer("app/(root)/ai-image/page.tsx");
        assert.doesNotMatch(pagina, CATCH_MUDO);
        assert.equal((pagina.match(/console\.warn\("\[ai-image\]/g) ?? []).length, 2);
    });

    test("los nombres de las etapas se leen enteros y la vista previa enseña el anuncio entero", () => {
        const campana = leer(`${C}/steps/StepCampaign.tsx`);
        assert.doesNotMatch(campana, /<span className="truncate[^"]*">\{label\}<\/span>/, "el nombre de una etapa se sigue cortando con «…»");
        assert.match(campana, /<span className="text-xs font-medium leading-tight">\{label\}<\/span>/);
        const previa = leer(`${C}/AdPreviewPanel.tsx`);
        assert.match(previa, /object-contain/);
        assert.doesNotMatch(previa, /object-cover/, "la vista previa sigue recortando el anuncio");
    });

    test("el menú dice «1 cuenta asociada» y «N cuentas asociadas»", () => {
        const menu = leer("components/AccountSwitcher.tsx");
        assert.match(menu, /count === 1 \? "1 cuenta asociada" : `\$\{count\} cuentas asociadas`/);
        assert.doesNotMatch(menu, /\)\} asociadas</, "el adjetivo va otra vez fuera del número");
    });

    test("la pantalla va con sus tildes", () => {
        for (const f of ["ad-generator.constants.ts", "steps/StepEngine.tsx", "steps/StepStyle.tsx", "steps/StepCampaign.tsx", "AdPreviewPanel.tsx", "hooks/useAdGenerator.ts"]) {
            const m = SIN_TILDE.exec(leer(`${C}/${f}`));
            assert.equal(m, null, `${f}: «${m?.[0]}» sin tilde`);
        }
    });

    test("la pantalla expone las marcas con las que la guía señala sus partes", () => {
        // Las recetas de las capturas no usan coordenadas: si una marca se va,
        // la guía se regenera señalando a ninguna parte.
        const receta = leer("scripts/capturar-guia-ai-imagenes.mjs");
        const pantalla = [
            "AdGeneratorStudio.tsx",
            "StepNav.tsx",
            "StepFooter.tsx",
            "AdPreviewPanel.tsx",
            "AdCopyPanel.tsx",
            "steps/StepImages.tsx",
            "steps/StepCampaign.tsx",
            "steps/StepStyle.tsx",
            "steps/StepEngine.tsx",
        ]
            .map((f) => leer(`${C}/${f}`))
            .join("\n");
        const zonas = [...new Set([...receta.matchAll(/zona\("([a-z-]+)"\)/g)].map((m) => m[1]))];
        assert.ok(zonas.length >= 15, `la receta solo usa ${zonas.length} zonas`);
        for (const z of zonas) assert.ok(pantalla.includes(`data-zona="${z}"`), `la receta señala la zona «${z}» y la pantalla no la tiene`);
        const literales = [...new Set([...receta.matchAll(/\[data-(zona|panel|campo|boton|interruptor)="([a-z-]+)"\]/g)].map((m) => `data-${m[1]}="${m[2]}"`))];
        assert.ok(literales.length >= 12, `la receta solo nombra ${literales.length} marcas`);
        for (const m of literales) assert.ok(pantalla.includes(m), `la receta usa «${m}» y la pantalla no lo tiene`);
    });
}
