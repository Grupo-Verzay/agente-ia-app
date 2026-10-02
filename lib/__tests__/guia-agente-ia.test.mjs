/**
 * El banco de la GUÍA PÚBLICA de Agente IA (`/guia/agente-ia`).
 *
 * Las mismas cosas que la guía de Leads y la de Mis notas, y por el mismo
 * motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los canales, las ocho
 *    pestañas del editor, lo que ofrece «Agregar acción», los modos de la
 *    bienvenida, los tipos de captura de Gestión, las coincidencias y las
 *    acciones de una palabra clave, el «⋯» del editor y los campos del Perfil
 *    que documenta `lib/guia-agente-ia.ts` se leen del CÓDIGO de `/ia`. Una
 *    pestaña o una acción nueva sin su nombre en la guía pone esto en rojo,
 *    con el nombre de la que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * `MODO=roto` lee los ficheros de `ANTES_AGENTE_IA_REF` —pinchado a un
 * commit, nunca `origin/main`— y afirma que no había guía de Agente IA, ni
 * marcas en la pantalla con las que una receta la pudiera señalar.
 *
 * Se levanta con `scripts/banco-guia-agente-ia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_AGENTE_IA_REF ?? "24ba0b2";

const AI = "app/(root)/ai/_components";
const CANALES = "lib/channel-training.ts";
const ETIQUETAS = `${AI}/ai-section-labels.ts`;
const ACCIONES = `${AI}/FunctionSelector.tsx`;
const INICIO = `${AI}/TrainingBuilder.tsx`;
const PERFIL = `${AI}/BusinessPromptBuilder.tsx`;
const PALABRAS = `${AI}/KeywordsBuilder.tsx`;
const TIPOS = "types/agentAi.ts";
const PESTANAS_DE_CANAL = "app/(root)/ia/_components/ChannelTabs.tsx";

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

/** Los valores de un objeto `{ clave: "texto", … } as const`, en su orden. */
export function losValoresDe(fuente, nombre) {
    const ini = fuente.indexOf(`export const ${nombre} = {`);
    if (ini < 0) return [];
    const fin = fuente.indexOf("} as const", ini);
    return [...fuente.slice(ini, fin).matchAll(/^\s+[\w"-]+:\s*"([^"]+)"/gm)].map((m) => m[1]);
}

/**
 * Lo que ofrece «Agregar acción» fuera de Gestión, grupo por grupo, sin el
 * emoji del principio. Se lee del marcado: la rama `!isManagement` para las
 * acciones y el segundo grupo («CONVERSACIÓN»; antes «TEXTO»).
 */
export function losGruposDeAgregarAccion(fuente) {
    const quitarEmoji = (t) => t.replace(/^[^\p{L}]+/u, "").trim();
    const spans = (trozo) => [...trozo.matchAll(/<span className="flex items-center gap-2">([^<]+)<\/span>/g)].map((m) => quitarEmoji(m[1]));
    const iAcc = fuente.indexOf("{!isManagement && (");
    const iConv = fuente.indexOf('heading="CONVERSACIÓN"');
    const iTexto = iConv >= 0 ? iConv : fuente.indexOf('heading="TEXTO"');
    if (iAcc < 0 || iTexto < 0) return { acciones: [], textos: [] };
    const acciones = spans(fuente.slice(iAcc, fuente.indexOf("</CommandGroup>", iAcc)));
    const textos = spans(fuente.slice(iTexto, fuente.indexOf("</CommandGroup>", iTexto)));
    return { acciones, textos };
}

if (ROTO) {
    test("ANTES no había guía pública de Agente IA", () => {
        assert.equal(leer("lib/guia-agente-ia.ts"), "", "lib/guia-agente-ia.ts ya existía en ANTES_AGENTE_IA_REF");
        assert.equal(leer("app/guia/agente-ia/page.tsx"), "", "la página ya existía en ANTES_AGENTE_IA_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_AGENTE_IA_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/["']agente-ia["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía de Agente IA");
        // Y la pantalla no exponía nada con lo que una receta la pudiera
        // señalar: las capturas se habrían tomado por coordenadas.
        const pantalla = [PESTANAS_DE_CANAL, `${AI}/MainAi.tsx`, `${AI}/TrainingBuilder.tsx`].map(leer).join("\n");
        for (const marca of ["data-canales-del-agente", "data-barra-del-editor", "data-vista-previa", "data-bloque"]) {
            assert.ok(!pantalla.includes(marca), `la pantalla ya tenía «${marca}»`);
        }
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-agente-ia/guia-agente-ia.mjs"));
    // Todo lo que la guía dice: títulos, resúmenes, pasos y consejos.
    const todo = guia.SECCIONES.flatMap((s) => [s.titulo, s.resumen, ...s.pasos.flatMap((p) => [p.titulo, p.texto]), ...(s.consejos ?? [])]).join(" \n ");
    const elPaso = (slug, imagen) => guia.laSeccion(slug).pasos.find((p) => p.imagen === imagen).texto;

    test("los canales documentados son los de la pantalla, en su orden", () => {
        const enLaPantalla = [...leer(CANALES).matchAll(/\{ slug: '[^']+', label: '([^']+)'/g)].map((m) => m[1]);
        assert.ok(enLaPantalla.length >= 6, `se leyeron ${enLaPantalla.length} canales`);
        assert.deepEqual([...guia.CANALES_DOCUMENTADOS], enLaPantalla);
        const texto = elPaso("vista-general", "canales.webp");
        for (const c of enLaPantalla) assert.ok(texto.includes(c), `el paso de los canales no nombra «${c}»`);
    });

    test("las pestañas del editor son las de la barra, en su orden, y la guía dice cuántas son", () => {
        const enLaPantalla = losValoresDe(leer(ETIQUETAS), "TYPE_AI_LABELS");
        assert.equal(enLaPantalla.length, 8, `se leyeron ${enLaPantalla.length} pestañas`);
        assert.deepEqual([...guia.PESTANAS_DEL_EDITOR], enLaPantalla);
        assert.match(elPaso("vista-general", "barra-del-editor.webp"), /ocho pestañas/);
        // Cada pestaña sale nombrada en algún sitio de la guía.
        for (const p of enLaPantalla) assert.ok(todo.includes(p), `la guía no nombra la pestaña «${p}»`);
    });

    test("«Agregar acción» ofrece lo que la guía dice, grupo por grupo", () => {
        const { acciones, textos } = losGruposDeAgregarAccion(leer(ACCIONES));
        assert.deepEqual([...guia.ACCIONES_DE_UN_PASO], acciones);
        assert.deepEqual([...guia.TEXTOS_DE_UN_PASO], textos);
        const texto = elPaso("elementos", "elementos-menu.webp");
        for (const a of [...acciones, ...textos]) assert.ok(texto.includes(a), `el menú de acciones no nombra «${a}»`);
    });

    test("los modos de la bienvenida, los tipos de captura y las reglas son los del código", () => {
        const modos = [...leer(INICIO).matchAll(/\{ type: "(\w+)", icon: /g)].map((m) => m[1]);
        assert.deepEqual([...guia.MODOS_DE_BIENVENIDA], modos);
        for (const m of modos) assert.ok(elPaso("pasos", "pasos-bienvenida.webp").includes(m), `la bienvenida no nombra el modo «${m}»`);

        const tipos = JSON.parse(`[${/export const SUBTYPE_OPTIONS = \[([^\]]+)\]/.exec(leer(TIPOS))?.[1] ?? ""}]`);
        assert.deepEqual([...guia.TIPOS_DE_CAPTURA], tipos);
        for (const t of tipos) assert.ok(elPaso("gestion", "gestion-tipo.webp").includes(t), `Gestión no nombra el tipo «${t}»`);

        const palabras = leer(PALABRAS);
        const coincidencias = [...palabras.matchAll(/\/> (Contiene|Exacta)<\/span>/g)].map((m) => m[1]);
        assert.deepEqual([...guia.COINCIDENCIAS], coincidencias);
        const acciones = [...palabras.matchAll(/<\w+ className="h-3\.5 w-3\.5" \/>\s*\n\s*(Responder con texto|Escalar a asesor)\s*\n/g)].map((m) => m[1]);
        assert.deepEqual([...guia.ACCIONES_DE_UNA_REGLA], acciones);
        for (const c of coincidencias) assert.ok(elPaso("palabras-clave", "palabras-clave-nueva.webp").includes(c), `la regla nueva no nombra «${c}»`);
        assert.ok(todo.includes("Escalar a asesor"));
    });

    test("el «⋯» del editor y los campos del Perfil son los de la pantalla", () => {
        const opciones = losValoresDe(leer(ETIQUETAS), "OPCIONES_DEL_AGENTE");
        assert.deepEqual([...guia.OPCIONES_DEL_AGENTE], opciones);
        const texto = elPaso("guardar-y-opciones", "menu-opciones.webp");
        for (const o of opciones) assert.ok(texto.includes(o), `el «⋯» no nombra «${o}»`);

        const perfil = leer(PERFIL);
        const campos = [...perfil.matchAll(/<FormLabel className="text-sm font-semibold">\s*([^<{]+?)\s*(?:<span|<\/FormLabel>)/g)].map((m) => m[1]);
        assert.deepEqual([...guia.CAMPOS_DEL_PERFIL], campos.slice(0, guia.CAMPOS_DEL_PERFIL.length), "los campos fijos del Perfil no son los de la guía");
        assert.ok(campos.includes("Notas / Instrucciones extra"), "el Perfil ya no tiene «Notas / Instrucciones extra»");
        assert.match(elPaso("perfil", "perfil-firma.webp"), /Notas \/ Instrucciones extra/);
    });

    test("la vista general numera las seis zonas, y el menú es el de Entrenamiento", () => {
        const texto = elPaso("vista-general", "vista-general.webp");
        assert.equal(guia.ZONAS_DE_LA_PANTALLA.length, 6);
        guia.ZONAS_DE_LA_PANTALLA.forEach((z, i) => assert.ok(texto.includes(`${i + 1} ${z}`), `la vista general no numera «${z}» como ${i + 1}`));
        assert.equal(guia.MODULO_DE_AGENTE_IA, "Entrenamiento");
        assert.match(elPaso("vista-general", "menu-lateral.webp"), /dentro de Entrenamiento/);
    });

    test("la guía cubre todos los apartados de la pantalla, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, [
            "vista-general",
            "canales",
            "perfil",
            "pasos",
            "elementos",
            "conocimiento",
            "palabras-clave",
            "gestion",
            "cotizaciones",
            "guardar-y-opciones",
        ]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/agente-ia/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("guardar-y-opciones").siguiente, null);
        assert.equal(guia.lasVecinas("perfil").anterior.slug, "canales");
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"agente-ia"/);
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

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "agente-ia");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/agente-ia/${n}`);
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
        for (const f of ["app/guia/agente-ia/page.tsx", "app/guia/agente-ia/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/agente-ia/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deAgente = [["AGENTE_IA", "·"], ["AgenteIa", "·"], ["Agente IA", "·"], ["agente-ia", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/agente-ia/${rel}`), deAgente),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/agente-ia/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
