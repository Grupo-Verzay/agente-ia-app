/**
 * El banco de la GUÍA PÚBLICA de AI Imágenes (`/guia/ai-imagenes`).
 *
 * Las mismas cosas que las guías de Leads y de Mis notas, y por el mismo
 * motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los cuatro pasos, los tres
 *    formatos con su medida, las diez etapas de la estructura de marketing,
 *    los estilos de fábrica, los tres motores y las tres calidades que
 *    documenta `lib/guia-ai-imagenes.ts` se leen de
 *    `ad-generator.constants.ts`; los hashtags de cada red, de
 *    `lib/copy-del-anuncio.ts`. Una etapa nueva sin su nombre en la guía pone
 *    esto en rojo, con el nombre de la que falta.
 * 2. **El Gemini fingido reconoce lo que la pantalla pide.** Las capturas y el
 *    vídeo salen de un doble de Google (`scripts/fingido-guia-ai-imagenes.mjs`)
 *    que decide qué imagen devolver leyendo el prompt: sus marcas tienen que
 *    ser las que escribe `generateAdImage` y sus redes las de `LAS_REDES`. Si
 *    la pantalla gana una etapa, el doble no la reconocería y la guía se
 *    regeneraría con un error pintado en la vista previa.
 * 3. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 4. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 5. **Es simétrica con Leads**: el código de sus dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * `MODO=roto` lee los ficheros de `ANTES_AI_IMAGENES_REF` —pinchado a un
 * commit, nunca `origin/main`— y afirma que no había guía de AI Imágenes, ni
 * marcas en la pantalla con las que una receta pudiera señalar sus partes.
 *
 * Se levanta con `scripts/banco-guia-ai-imagenes.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_AI_IMAGENES_REF ?? "ab6b110";

const CONSTANTES = "app/(root)/ai-image/_components/ad-generator.constants.ts";
const ACCION = "actions/ai-image-actions.ts";

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

/** El trozo de un `export const X = [ … ]` de las constantes de la pantalla. */
export function laLista(fuente, nombre) {
    const ini = fuente.indexOf(`export const ${nombre}`);
    if (ini < 0) return "";
    const fin = fuente.indexOf("\n]", ini);
    return fuente.slice(ini, fin < 0 ? fuente.length : fin);
}

/** Los `name:` de una lista de las constantes, en su orden. */
export function losNombres(fuente, nombre) {
    return [...laLista(fuente, nombre).matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
}

if (ROTO) {
    test("ANTES no había guía pública de AI Imágenes", () => {
        assert.equal(leer("lib/guia-ai-imagenes.ts"), "", "lib/guia-ai-imagenes.ts ya existía en ANTES_AI_IMAGENES_REF");
        assert.equal(leer("app/guia/ai-imagenes/page.tsx"), "", "la página ya existía en ANTES_AI_IMAGENES_REF");
        assert.equal(leer("scripts/fingido-guia-ai-imagenes.mjs"), "", "el Gemini fingido ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_AI_IMAGENES_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/["']ai-imagenes["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!leer("lib/tutoriales-del-modulo.ts").includes("/ai-image"), "la tarjeta de tutoriales ya estaba registrada");
        // Y la pantalla no exponía nada con lo que una receta la pudiera
        // señalar: las capturas se habrían tomado por coordenadas.
        const pantalla = ["AdGeneratorStudio.tsx", "StepNav.tsx", "StepFooter.tsx", "AdPreviewPanel.tsx", "steps/StepCampaign.tsx"]
            .map((f) => leer(`app/(root)/ai-image/_components/${f}`))
            .join("\n");
        for (const marca of ['data-zona="api-key"', 'data-zona="pasos"', 'data-boton="generar"', 'data-zona="formatos-de-la-vista"', 'data-interruptor="kit"']) {
            assert.ok(!pantalla.includes(marca), `la pantalla ya tenía «${marca}»`);
        }
        // El segundo paso se llamaba «imagen» en la barra de pasos.
        assert.match(leer(CONSTANTES), /id: 'campaign', label: 'imagen'/);
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-ai-imagenes/guia-ai-imagenes.mjs"));
    const copy = await import(path.join(RAIZ, "lib/__tests__/.compilado/pantalla-ai-imagenes/copy-del-anuncio.mjs"));
    const fingido = await import(path.join(RAIZ, "scripts/fingido-guia-ai-imagenes.mjs"));
    const constantes = leer(CONSTANTES);
    const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => p.texto)).join(" \n ");
    const elPaso = (seccion, imagen) => guia.laSeccion(seccion).pasos.find((p) => p.imagen === imagen).texto;

    test("los cuatro pasos documentados son los de la pantalla, en su orden y numerados", () => {
        const enLaPantalla = [...laLista(constantes, "STUDIO_STEPS").matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual(guia.PASOS_DEL_GENERADOR.map((p) => p.paso), enLaPantalla);
        const texto = elPaso("vista-general", "pasos.webp");
        guia.PASOS_DEL_GENERADOR.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.paso}`), `la captura de los pasos no numera «${p.paso}» como ${i + 1}`));
        // Y cada paso tiene su sección, en el mismo orden.
        const slugs = guia.SECCIONES.map((s) => s.slug);
        const posiciones = guia.PASOS_DEL_GENERADOR.map((p) => slugs.indexOf(p.seccion));
        assert.ok(posiciones.every((x) => x >= 0), "un paso sin su sección");
        assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, "las secciones de los pasos no van en su orden");
    });

    test("los formatos, las etapas, los estilos, los motores y las calidades son los de la pantalla", () => {
        const formatos = [...laLista(constantes, "AD_FORMATS").matchAll(/name: '([^']+)', sub: '([^']+)'/g)].map((m) => ({ formato: m[1], medida: m[2] }));
        assert.deepEqual(guia.FORMATOS_DOCUMENTADOS.map((f) => ({ formato: f.formato, medida: f.medida })), formatos);
        const etapas = losNombres(constantes, "MARKETING_TEMPLATES").map((n) => n.replace(/^\d+\.\s*/, ""));
        assert.equal(etapas.length, 10, "no se leyeron las diez etapas");
        assert.deepEqual([...guia.ETAPAS_DOCUMENTADAS], etapas);
        assert.deepEqual([...guia.ESTILOS_DOCUMENTADOS], losNombres(constantes, "DEFAULT_STYLES"));
        assert.deepEqual([...guia.MOTORES_DOCUMENTADOS], losNombres(constantes, "GENERATION_MODELS"));
        assert.deepEqual([...guia.CALIDADES_DOCUMENTADAS], losNombres(constantes, "IMAGE_QUALITY_OPTIONS"));
        // Y los pasos de la guía los nombran.
        for (const f of guia.FORMATOS_DOCUMENTADOS) assert.ok(todo.includes(f.formato) && todo.includes(f.medida), `ningún paso nombra «${f.formato} (${f.medida})»`);
        for (const e of [guia.ETAPAS_DOCUMENTADAS[0], guia.ETAPAS_DOCUMENTADAS.at(-1)]) assert.ok(todo.includes(e), `ningún paso nombra la etapa «${e}»`);
        for (const e of guia.ESTILOS_DOCUMENTADOS) assert.ok(todo.includes(e), `ningún paso nombra el estilo «${e}»`);
        for (const c of guia.CALIDADES_DOCUMENTADAS) assert.ok(todo.includes(c), `ningún paso nombra la calidad «${c}»`);
        const motores = elPaso("motor", "motor-modelo.webp");
        guia.MOTORES_DOCUMENTADOS.forEach((m, i) => {
            const corto = m.replace(/\s*\(.*\)$/, "");
            assert.ok(motores.includes(`${i + 1} ${corto}`), `el paso del modelo no numera «${corto}» como ${i + 1}`);
        });
    });

    test("lo que la guía dice de cada red es la regla del texto del post", () => {
        const cuantos = { 0: "sin hashtags" };
        for (const f of guia.FORMATOS_DOCUMENTADOS) {
            const red = copy.laRedDelFormato(guia.FORMATOS_DOCUMENTADOS.indexOf(f) === 0 ? "1:1" : guia.FORMATOS_DOCUMENTADOS.indexOf(f) === 1 ? "9:16" : "16:9");
            assert.equal(copy.LAS_REDES[red].nombre, f.formato, `el formato «${f.formato}» no es el de la red ${red}`);
            const dicho = guia.REDES_DEL_TEXTO.find((r) => r.red === f.red);
            const n = copy.LAS_REDES[red].hashtags;
            assert.equal(dicho.hashtags, cuantos[n] ?? `hasta ${n} hashtags`, `la guía dice «${dicho.hashtags}» de ${f.red}`);
        }
        const texto = elPaso("texto-del-post", "texto-whatsapp.webp");
        assert.match(texto, /Instagram lleva hasta 6 hashtags/);
        assert.match(texto, /WhatsApp sin hashtags/);
        assert.match(texto, /Facebook hasta 2/);
    });

    test("el Gemini fingido reconoce EXACTAMENTE las etapas y las redes de la pantalla", () => {
        const ids = [...laLista(constantes, "MARKETING_TEMPLATES").matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual(fingido.MARCAS_DE_LA_ETAPA.map((m) => m.etapa), ids, "las etapas del doble no son las de MARKETING_TEMPLATES");
        assert.deepEqual(fingido.MARCAS_DE_LA_ETAPA.map((m) => m.nombre), [...guia.ETAPAS_DOCUMENTADAS]);
        // Cada marca la escribe `generateAdImage` en su prompt.
        const accion = leer(ACCION);
        for (const m of fingido.MARCAS_DE_LA_ETAPA) assert.ok(accion.includes(m.marca), `generateAdImage ya no escribe «${m.marca}»: el doble no reconocería la etapa ${m.etapa}`);
        // Y cada red, con el nombre con que la pide `instruccionesDelCopy`.
        assert.deepEqual(
            Object.fromEntries(Object.entries(fingido.REDES_DEL_PROMPT).map(([n, r]) => [r, n])),
            Object.fromEntries(Object.entries(copy.LAS_REDES).map(([r, x]) => [r, x.nombre])),
        );
        // Lee de verdad lo que la pantalla escribe.
        // La pantalla pide el copy con «<nombre> — <descripción>» de la etapa.
        assert.ok(
            leer("app/(root)/ai-image/_components/hooks/useAdGenerator.ts").includes("`${plantilla.name} — ${plantilla.description}`"),
            "la pantalla ya no nombra la etapa del copy como «nombre — descripción»",
        );
        const prompt = copy.instruccionesDelCopy({ formato: "9:16", plantilla: "1. Hero Section — Impacto, problema y solución.", estilo: "Premium" });
        assert.equal(fingido.laRedDelCopy(prompt), "whatsapp");
        assert.equal(fingido.laEtapaDelCopy(prompt), "hero");
    });

    test("el Gemini fingido tiene imagen y texto para lo que el vídeo y las capturas enseñan", () => {
        // El Hero en los tres formatos y con dos versiones (las variantes), y
        // su texto en las tres redes; las demás etapas, en cuadrado (el kit).
        for (const formato of ["1:1", "9:16", "16:9"]) assert.ok(fingido.laImagenDeEjemplo("hero", formato), `sin imagen hero ${formato}`);
        const a = fingido.laImagenDeEjemplo("hero", "1:1");
        const b = fingido.laImagenDeEjemplo("hero", "1:1");
        assert.notEqual(a, b, "el hero cuadrado no tiene dos versiones: las variantes serían iguales");
        for (const m of fingido.MARCAS_DE_LA_ETAPA) {
            assert.ok(fingido.laImagenDeEjemplo(m.etapa, "1:1").includes(`${m.etapa}-1x1`), `sin imagen de la etapa ${m.etapa}`);
            assert.ok(fingido.elCopyDeEjemplo(m.etapa, "instagram"), `sin texto de Instagram para ${m.etapa}`);
        }
        for (const red of ["instagram", "whatsapp", "facebook"]) {
            const t = fingido.elCopyDeEjemplo("hero", red);
            assert.ok(t, `sin texto del hero para ${red}`);
            // Lo que se enseña cumple la regla de su red.
            const formato = { instagram: "1:1", whatsapp: "9:16", facebook: "16:9" }[red];
            assert.equal(copy.comoSeLeeElCopy(t, formato), t.trim(), `el texto de ejemplo de ${red} no pasa la regla de su red tal cual`);
        }
        // Y ninguna imagen de ejemplo es una foto de una persona real ni pesa de más.
        const dir = path.join(RAIZ, "scripts", "guia-ai-imagenes");
        for (const f of readdirSync(dir).filter((n) => n.endsWith(".jpg"))) {
            const kb = statSync(path.join(dir, f)).size / 1024;
            assert.ok(kb > 5 && kb < 400, `${f} pesa ${kb.toFixed(0)} KB`);
        }
    });

    test("la guía cubre la pantalla entera, y cada sección tiene su página y su miniatura", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "api-key", "producto", "campana", "estilo", "motor", "generar", "texto-del-post", "kit-landing"]);
        const pagina = leer("app/guia/ai-imagenes/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("kit-landing").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"ai-imagenes"/);
        assert.equal(guia.GUIA_AI_IMAGENES.titulo, "AI Imágenes");
        // La vista general numera sus siete zonas.
        const vista = elPaso("vista-general", "vista-general.webp");
        guia.ZONAS_DE_LA_PANTALLA.forEach((z, i) => assert.ok(vista.includes(`${i + 1} ${z}`), `la vista general no numera «${z}» como ${i + 1}`));
    });

    test("cada paso es corto: la captura explica, el texto pone nombre", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("la API key se pone donde la guía dice, y la pantalla lo dice igual", () => {
        // La guía manda a «Configurar» de esta pantalla, no a Mi Perfil: Perfil
        // solo ofrece OpenAI. Los avisos de la pantalla tienen que decir lo mismo.
        assert.match(elPaso("api-key", "api-key-aviso.webp"), /Configurar/);
        assert.doesNotMatch(todo, /Mi Perfil/i, "la guía manda a Mi Perfil");
        assert.ok(guia.laSeccion("api-key").consejos.some((c) => /no en Mi Perfil/.test(c)));
        for (const f of [ACCION, "lib/copy-del-anuncio.ts"]) assert.doesNotMatch(leer(f), /"[^"\n]*Mi Perfil[^"\n]*"/, `un aviso de ${f} todavía manda a Mi Perfil`);
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "ai-imagenes");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/ai-imagenes/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5, `${n} pesa ${kb.toFixed(1)} KB: no parece una captura`);
            assert.ok(kb < 600, `${n} pesa ${kb.toFixed(0)} KB: demasiado para una página que se abre en el móvil`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA y NO se indexa, y no toca la base más que la de Leads", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/ai-imagenes/page.tsx", "app/guia/ai-imagenes/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/ai-imagenes/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deAiImagenes = [["AI_IMAGENES", "·"], ["AiImagenes", "·"], ["AI Imágenes", "·"], ["ai-imagenes", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/ai-imagenes/${rel}`), deAiImagenes),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/ai-imagenes/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
