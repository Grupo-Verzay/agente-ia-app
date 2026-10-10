/**
 * El banco de la PANTALLA de Agente IA (`/ia`): lo que se arregló al
 * documentarla, para que no se vuelva a separar.
 *
 * El fallo de esta pantalla nunca fue uno: eran ocho pestañas escritas cada
 * una a su manera. La pestaña «Inicio» abría una tarjeta que decía
 * «Entrenamiento», Preguntas decía «Agregar Pregunta» con mayúscula al lado
 * de «Agregar producto», el contador de «Elementos del paso» enseñaba el
 * NÚMERO DEL PASO y no sus elementos, cada lista tenía sus bordes, y la «X»
 * de cerrar de Métricas quedaba encima del botón de actualizar. Ninguna de
 * esas cosas da un error: se ven como una pantalla que no es de una pieza.
 *
 * Así que esto no mide una pestaña: exige que las CINCO listas —Inicio,
 * Preguntas, Productos, Extras y Gestión— y las tarjetas de sus elementos
 * digan lo mismo y salgan del mismo sitio.
 *
 * 1. **Los nombres salen de `ai-section-labels.ts`**: el título de cada
 *    pestaña, su botón de agregar, su mensaje vacío y su «Eliminar».
 * 2. **El asa dice qué arrastra** («Arrastrar paso», «Arrastrar pregunta»…).
 * 3. **El contador cuenta ELEMENTOS**, no el número del bloque.
 * 4. **Los mismos bordes** (`pl-10` / `pr-3`) en las cinco listas.
 * 5. **Toda tarjeta de elemento lleva `TituloDelElemento`**.
 * 6. **Guardar no se enciende al abrir** (`laSeccionEnOrden`, probada aquí
 *    de verdad, no leída).
 * 7. **Las dos hojas del «⋯» miden lo mismo**, y el botón de actualizar de
 *    Métricas no queda debajo de la «X».
 * 8. **Sin textos sin tilde** en lo que se lee.
 *
 * `MODO=roto` lee los mismos ficheros de `ANTES_REF` —pinchado a un commit,
 * nunca `origin/main`— y afirma los fallos. Se levanta con
 * `scripts/banco-guia-agente-ia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_PANTALLA_REF ?? "ab6b110";
const AI = "app/(root)/ai/_components";

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

/** Las cinco listas y cómo se llama lo que cada una arrastra. */
const LISTAS = [
    { fichero: "TrainingBuilder.tsx", clave: "training", cosa: "paso" },
    { fichero: "FqaBuilder.tsx", clave: "faq", cosa: "pregunta" },
    { fichero: "ProductBuilder.tsx", clave: "products", cosa: "producto" },
    { fichero: "ExtraInfoBuilder.tsx", clave: "more", cosa: "extra" },
    { fichero: "ManagementBuilder.tsx", clave: "management", cosa: "gestión" },
];

/** El código sin comentarios: un comentario que cuenta el arreglo no es el arreglo. */
const sinComentarios = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

if (ROTO) {
    test("ANTES: la pestaña «Inicio» abría una tarjeta que decía «Entrenamiento»", () => {
        assert.match(leer(`${AI}/TrainingBuilder.tsx`), />Entrenamiento<\/CardTitle>/);
        assert.equal(leer(`${AI}/ai-section-labels.ts`).includes("AGREGAR_EN_LA_PESTANA"), false);
    });

    test("ANTES: el contador de «Elementos del paso» enseñaba el número del paso", () => {
        for (const { fichero } of LISTAS.slice(0, 4)) {
            assert.match(leer(`${AI}/${fichero}`), /<Badge variant="secondary">\{idx \+ 1\}<\/Badge>/, `${fichero} ya contaba elementos`);
        }
    });

    test("ANTES: «Agregar Pregunta» con mayúscula y el asa decía solo «Arrastrar»", () => {
        const fqa = leer(`${AI}/FqaBuilder.tsx`);
        assert.ok(fqa.includes("Agregar Pregunta"));
        assert.ok(fqa.includes('title="Arrastrar"'));
    });

    test("ANTES: las listas no tenían los mismos bordes (`px-6` en Preguntas)", () => {
        assert.match(leer(`${AI}/FqaBuilder.tsx`), /className="px-6 space-y-2"/);
    });

    test("ANTES: la «X» de Métricas caía sobre el botón de actualizar y las dos hojas medían distinto", () => {
        const metricas = leer(`${AI}/AgentMetricsPanel.tsx`);
        assert.match(metricas, /<div className="flex items-center justify-between">/);
        assert.match(leer(`${AI}/VersionHistoryPanel.tsx`), /sm:max-w-sm/);
    });

    test("ANTES: textos sin tilde en lo que se lee", () => {
        assert.ok(leer(`${AI}/TrainingBuilder.tsx`).includes("Condicion para avanzar"));
        assert.ok(leer(`${AI}/AgentPromptChatDialog.tsx`).includes("crear formulas"));
    });
} else {
    const etiquetas = leer(`${AI}/ai-section-labels.ts`);

    test("el título, el botón de agregar, el mensaje vacío y el «Eliminar» salen de ai-section-labels", () => {
        for (const { fichero, clave } of LISTAS) {
            const t = sinComentarios(leer(`${AI}/${fichero}`));
            assert.ok(t.includes(`TYPE_AI_LABELS.${clave}`), `${fichero}: el título no sale de TYPE_AI_LABELS.${clave}`);
            assert.ok(t.includes(`PESTANA_VACIA.${clave}`), `${fichero}: el mensaje vacío está escrito a mano`);
            assert.ok(t.includes(`ELIMINAR_EN_LA_PESTANA.${clave}`), `${fichero}: el «Eliminar» está escrito a mano`);
            // Ninguna vuelve a escribir su título ni su botón a mano.
            assert.doesNotMatch(t, />\s*(Entrenamiento|Preguntas|Productos|Extras|Gestión)\s*<\/CardTitle>/, `${fichero}: título escrito a mano`);
            assert.doesNotMatch(t, />\s*Agregar (Pregunta|Producto|Extra|paso|pregunta|producto|extra)\s*</, `${fichero}: botón de agregar escrito a mano`);
        }
        const kw = sinComentarios(leer(`${AI}/KeywordsBuilder.tsx`));
        for (const x of ["TYPE_AI_LABELS.keywords", "AGREGAR_EN_LA_PESTANA.keywords", "PESTANA_VACIA.keywords", "ELIMINAR_EN_LA_PESTANA.keywords"]) {
            assert.ok(kw.includes(x), `Palabras clave no usa ${x}`);
        }
        // Y una regla ya no se borra al primer clic: pide confirmar como las demás.
        assert.match(kw, /<AlertDialogTitle>\{ELIMINAR_EN_LA_PESTANA\.keywords\.titulo\}<\/AlertDialogTitle>/);
        // Los nombres de las pestañas son los que documenta la guía.
        for (const n of ["Perfil", "Inicio", "Preguntas", "Productos", "Extras", "Palabras clave", "Gestión", "Cotizaciones"]) {
            assert.ok(etiquetas.includes(`"${n}"`), `ai-section-labels no nombra «${n}»`);
        }
    });

    test("el asa de arrastrar dice QUÉ arrastra, en las cinco listas", () => {
        for (const { fichero, cosa } of LISTAS) {
            const t = leer(`${AI}/${fichero}`);
            assert.ok(t.includes(`"Arrastrar ${cosa}"`), `${fichero}: el asa no dice «Arrastrar ${cosa}»`);
            assert.doesNotMatch(t, /title="Arrastrar"/, `${fichero}: un asa dice solo «Arrastrar»`);
        }
        assert.ok(leer(`${AI}/KeywordsBuilder.tsx`).includes('title="Arrastrar regla"'));
    });

    test("el contador de «Elementos del …» cuenta elementos, no el número del bloque", () => {
        for (const { fichero } of LISTAS) {
            const t = sinComentarios(leer(`${AI}/${fichero}`));
            const contadores = [...t.matchAll(/<Badge[^>]*data-cuantos-elementos[^>]*>\{([^}]+)\}<\/Badge>/g)].map((m) => m[1]);
            assert.ok(contadores.length >= 1, `${fichero}: sin contador marcado`);
            for (const c of contadores) assert.match(c, /elements \?\? \[\]\)\.length|elements\.length/, `${fichero}: el contador enseña «${c}»`);
            assert.doesNotMatch(t, /<Badge variant="secondary">\{idx \+ 1\}<\/Badge>/, `${fichero}: vuelve a enseñar el número del bloque`);
        }
    });

    test("los cinco bloques tienen los MISMOS bordes y la misma marca", () => {
        for (const { fichero } of LISTAS) {
            const t = sinComentarios(leer(`${AI}/${fichero}`));
            assert.ok(t.includes("data-bloque"), `${fichero}: el bloque no lleva data-bloque`);
            // `pl-10` arranca bajo el título; `pr-3` acaba bajo la papelera, en
            // la fila o —Gestión, cuyas tarjetas llevan el asa a la izquierda—
            // en su `CardContent`. Las dos formas dejan el mismo borde.
            const bordes = t.includes('"pl-10 pr-3') || (/<CardContent className="[^"]*\bpl-0 pr-3/.test(t) && t.includes('"pl-10 '));
            assert.ok(bordes, `${fichero}: el contenido no arranca bajo el título (pl-10 pr-3)`);
            assert.doesNotMatch(t, /className="px-6[ "]/, `${fichero}: vuelve un px-6 propio`);
        }
    });

    test("TODA tarjeta de elemento lleva TituloDelElemento y los bordes de las demás (px-3)", () => {
        const dir = path.join(RAIZ, AI, "action-steeps");
        const tarjetas = readdirSync(dir).filter((n) => n.endsWith("Card.tsx") && n !== "CustomCardAction.tsx");
        assert.ok(tarjetas.length >= 9, `solo ${tarjetas.length} tarjetas`);
        for (const n of tarjetas) {
            const t = sinComentarios(leer(`${AI}/action-steeps/${n}`));
            assert.ok(t.includes("<TituloDelElemento"), `${n}: escribe su título a mano`);
            assert.match(t, /<CardHeader className="[^"]*px-3/, `${n}: la cabecera no lleva px-3`);
        }
    });

    test("la flecha del Motor de Flujo gira y dice si está abierto", () => {
        const t = leer(`${AI}/TrainingBuilder.tsx`);
        assert.match(t, /aria-expanded=\{expandedMotor\.has\(step\.id\)\}/);
        assert.match(t, /expandedMotor\.has\(step\.id\) \? "rotate\(180deg\)"/);
    });

    test("Guardar no se enciende al abrir: la foto se arma con las secciones enderezadas", async () => {
        const main = sinComentarios(leer(`${AI}/MainAi.tsx`));
        for (const s of ["Training", "Faq", "Products", "Extras", "Management"]) {
            const usos = main.match(new RegExp(`laSeccionEnOrden\\(${s}DraftSchema\\.parse`, "g")) ?? [];
            assert.equal(usos.length, 2, `${s}: la foto de lo guardado y la recarga tienen que enderezar (${usos.length})`);
            assert.doesNotMatch(main, new RegExp(`build\\w+Markdown\\(\\s*${s}DraftSchema\\.parse`), `${s}: se arma sin enderezar`);
        }
        // Y la función hace lo que dice, de verdad.
        const { laSeccionEnOrden, ordenarElementos } = await import(path.join(RAIZ, "lib/__tests__/.compilado/agente-ia/orden-de-elementos.mjs"));
        const nota = { kind: "function", fn: "nota_interna", id: "n" };
        const texto = { kind: "text", id: "t" };
        const flujo = { kind: "function", fn: "ejecutar_flujo", id: "f" };
        const torcida = { steps: [{ elements: [nota, texto, flujo] }], extra: 1 };
        const derecha = laSeccionEnOrden(torcida);
        assert.deepEqual(derecha.steps[0].elements.map((e) => e.id), ordenarElementos([nota, texto, flujo]).map((e) => e.id));
        assert.equal(derecha.extra, 1, "se perdió lo que la sección llevaba además de los pasos");
        assert.equal(laSeccionEnOrden(derecha), derecha, "una sección ya en orden tiene que volver IGUAL (misma referencia)");
        assert.deepEqual(laSeccionEnOrden({ steps: [] }), { steps: [] });
    });

    test("las opciones del «⋯» y las ventanas que abren se llaman igual", () => {
        const main = sinComentarios(leer(`${AI}/MainAi.tsx`));
        for (const k of ["asistente", "metricas", "historial", "eliminar"]) {
            assert.ok(main.includes(`OPCIONES_DEL_AGENTE.${k}`), `el menú no usa OPCIONES_DEL_AGENTE.${k}`);
        }
        assert.ok(leer(`${AI}/AgentMetricsPanel.tsx`).includes("OPCIONES_DEL_AGENTE.metricas"));
        assert.ok(leer(`${AI}/VersionHistoryPanel.tsx`).includes("OPCIONES_DEL_AGENTE.historial"));
        assert.match(main, /aria-label="Más opciones del agente"/);
    });

    test("Métricas: el botón de actualizar no queda debajo de la «X», y las dos hojas miden lo mismo", () => {
        const metricas = leer(`${AI}/AgentMetricsPanel.tsx`);
        const historial = leer(`${AI}/VersionHistoryPanel.tsx`);
        // La «X» de la hoja va `absolute right-4 top-4` (16 px del borde, 16 de ancho).
        assert.match(leer("components/ui/sheet.tsx"), /absolute right-4 top-4/);
        assert.match(metricas, /<div className="flex items-center justify-between pr-8">/, "la fila del título de Métricas no deja sitio a la «X»");
        const ancho = (t) => /<SheetContent side="right" className="[^"]*(sm:max-w-\w+)/.exec(t)?.[1];
        assert.ok(ancho(metricas), "no se encontró el ancho de Métricas");
        assert.equal(ancho(historial), ancho(metricas), "Historial y Métricas salen del mismo menú y tienen que medir lo mismo");
    });

    test("sin textos sin tilde en lo que se lee", () => {
        const visibles = [
            [`${AI}/TrainingBuilder.tsx`, ["Condicion para avanzar"]],
            [`${AI}/AgentPromptChatDialog.tsx`, ["crear formulas", "quedara claro"]],
            [`${AI}/MainAi.tsx`, ["Desplazar pestanas"]],
        ];
        for (const [f, malas] of visibles) {
            const t = leer(f);
            for (const m of malas) assert.ok(!t.includes(m), `${f}: «${m}» sin tilde`);
        }
    });
}
