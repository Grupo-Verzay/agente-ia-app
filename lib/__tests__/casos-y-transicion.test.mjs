/**
 * «Agregar caso» y «Agregar transición» en un paso del entrenamiento.
 *
 * Lo que se comprueba, con el CÓDIGO de verdad (los dos constructores del
 * prompt empaquetados, el esquema que valida al guardar y el menú real):
 *
 *   1. El menú: el segundo grupo ya no se llama «TEXTO», y ofrece, en orden,
 *      Agregar caso, Agregar respuesta, Agregar transición, Agregar nota
 *      interna. ACCIONES no cambia.
 *   2. Lo que se inyecta en el bloque del paso es EXACTAMENTE la tabla
 *      «| Caso | Detección | Acción |» con su frase de respaldo, y al final la
 *      línea «➡️ TRANSICIÓN … current_step = N …». Sin destino, N+1.
 *   3. Varios casos: una sola tabla, A, B, C en el orden en que se agregaron,
 *      y la regla de que aplica el PRIMERO que coincide.
 *   4. Los dos constructores escriben lo mismo.
 *   5. Guardar no los pierde: el esquema conserva escenario, respuesta y destino.
 *   6. Un paso SIN casos ni transición sale idéntico al de antes (se compara con
 *      el constructor de `ANTES_REF`).
 *
 *   7. Preguntas, Productos y Extras: el mismo menú y las mismas tarjetas, y
 *      su transición va a un paso de INICIO (sin «siguiente»: sin destino, o
 *      con uno borrado, no se escribe nada). Gestión no: su menú solo captura.
 *
 * `MODO=roto` empaqueta el constructor de `ANTES_REF` y AFIRMA el fallo: un
 * paso con caso y transición no escribía ni tabla ni transición, y el menú no
 * los ofrecía. Se levanta con `scripts/banco-casos-y-transicion.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "83159ac";
const ANTES_FUERA = process.env.ANTES_FUERA_REF ?? "8958372";
const PESTANAS = ["FqaBuilder", "ProductBuilder", "ExtraInfoBuilder"].map((n) => `app/(root)/ai/_components/${n}.tsx`);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMP = join(AQUI, ".compilado", "casos-y-transicion");
const MENU = "app/(root)/ai/_components/FunctionSelector.tsx";

const leerAntes = (rel, ref = ANTES) => {
    try {
        return execSync(`git show ${ref}:${JSON.stringify(rel)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return "";
    }
};

const TABLA_UNO = [
    "| Caso | Detección | Acción |",
    "|---|---|---|",
    "| A | Pregunta por el precio | → Te paso la lista de precios |",
    "",
    "Si lo que dice el cliente no coincide con ningún Escenario declarado en la tabla, el agente repite el texto principal del paso y espera, sin inventar caso.",
].join("\n");

const transicion = (n) =>
    `➡️ TRANSICIÓN: Completados los datos de este paso → \`current_step = ${n}\`. Esperar respuesta del cliente antes de ejecutar el paso siguiente.`;

const pasos = () => [
    {
        id: "p1",
        title: "Bienvenida",
        mainMessage: "Saluda y pregunta qué necesita.",
        elements: [
            { id: "e1", kind: "function", fn: "ejecutar_flujo", flowId: "f1", flowName: "Catálogo" },
            { id: "c1", kind: "function", fn: "caso", escenario: "Pregunta por el precio", respuesta: "Te paso la lista de precios" },
            { id: "t1", kind: "function", fn: "transicion", destino: null },
            { id: "n1", kind: "function", fn: "nota_interna", nota: "No ofrezcas descuentos." },
        ],
    },
    {
        id: "p2",
        title: "Datos",
        mainMessage: "Pide nombre y ciudad.",
        elements: [
            { id: "c2", kind: "function", fn: "caso", escenario: "Da su nombre", respuesta: "Gracias, ¿y tu ciudad?" },
            { id: "x", kind: "text", text: "Sé breve." },
            { id: "c3", kind: "function", fn: "caso", escenario: "No quiere | dar datos", respuesta: "Sin problema,\nte ayudo igual" },
            { id: "c4", kind: "function", fn: "caso", escenario: "", respuesta: "" },
            { id: "t2", kind: "function", fn: "transicion", destino: "p4" },
        ],
    },
    { id: "p3", title: "Cierre", mainMessage: "Despide.", elements: [{ id: "t3", kind: "function", fn: "transicion", destino: null }] },
    { id: "p4", title: "Agenda", mainMessage: "Agenda la cita.", elements: [{ id: "t4", kind: "function", fn: "transicion", destino: "no-existe" }] },
];

// Un paso de los de siempre: sin casos ni transición.
const legado = () => [
    {
        id: "a",
        title: "Bienvenida",
        mainMessage: "Hola",
        elements: [
            { id: "1", kind: "function", fn: "notificar_asesor", notificationNumber: null },
            { id: "2", kind: "text", text: "Responde corto." },
            { id: "3", kind: "function", fn: "nota_interna", nota: "Interna." },
        ],
    },
    { id: "b", title: "Datos", mainMessage: "Pide datos", elements: [{ id: "4", kind: "text", text: "Uno a la vez." }] },
];

const FULL = {
    sectionPrefix: "PASO",
    renderMode: "full",
    mainMessageLabel: (n) => `OBJETIVO ${n}:`,
    elementsLabel: (n) => `ELEMENTOS ${n}:`,
};

const md = await import(join(COMP, ROTO ? "antes-markdown.mjs" : "markdown.mjs"));
const bloque = (salida, n) => salida.split("\n\n---\n\n")[n - 1];

if (ROTO) {
    test("ROTO: el menú no ofrecía caso ni transición, y el grupo se llamaba TEXTO", () => {
        const menu = leerAntes(MENU);
        assert.ok(menu.length > 0, `no se pudo leer ${MENU} de ${ANTES}`);
        assert.match(menu, /heading="TEXTO"/);
        assert.doesNotMatch(menu, /Agregar caso|Agregar transición/);
    });
    test("ROTO: un paso con caso y transición no escribía ni tabla ni transición", () => {
        const salida = md.buildSectionedMarkdown(pasos(), FULL);
        assert.doesNotMatch(salida, /\| Caso \| Detección \| Acción \|/);
        assert.doesNotMatch(salida, /TRANSICIÓN: Completados los datos/);
    });
    test("ROTO: Preguntas, Productos y Extras no ofrecían caso ni transición", () => {
        for (const rel of PESTANAS) {
            const f = leerAntes(rel, ANTES_FUERA);
            assert.ok(f.length > 0, `no se pudo leer ${rel} de ${ANTES_FUERA}`);
            assert.doesNotMatch(f, /conCasosYTransicion|updateTransicion|pasosDelInicio/, rel);
        }
        assert.doesNotMatch(leerAntes("lib/casos-y-transicion-del-paso.ts", ANTES_FUERA), /pasosDelInicio/);
    });
    test("ROTO: el esquema no conocía los campos (se perdían al guardar)", () => {
        assert.doesNotMatch(leerAntes("types/agentAi.ts"), /"caso"|"transicion"|escenario/);
    });
} else {
    const antes = await import(join(COMP, "antes-markdown.mjs"));
    const sp = await import(join(COMP, "sectioned.mjs"));
    const tipos = await import(join(COMP, "tipos.mjs"));
    const orden = await import(join(COMP, "orden.mjs"));
    const menu = fs.readFileSync(join(RAIZ, MENU), "utf8");

    test("el menú: ACCIONES igual, y el segundo grupo con las cuatro en su orden", () => {
        assert.doesNotMatch(menu, /heading="TEXTO"/, "el grupo ya no se llama TEXTO");
        const i = menu.indexOf('heading="CONVERSACIÓN"');
        assert.ok(i > 0);
        const grupo = menu.slice(i, menu.indexOf("</CommandGroup>", i));
        const opciones = [...grupo.matchAll(/<span className="flex items-center gap-2">[^\p{L}]*([^<]+)<\/span>/gu)].map((m) => m[1].trim());
        assert.deepEqual(opciones, ["Agregar caso", "Agregar respuesta", "Agregar transición", "Agregar nota interna"]);
        const acc = menu.slice(menu.indexOf("{!isManagement && ("), menu.indexOf("</CommandGroup>", menu.indexOf("{!isManagement && (")));
        const acciones = [...acc.matchAll(/<span className="flex items-center gap-2">[^\p{L}]*([^<]+)<\/span>/gu)].map((m) => m[1].trim());
        assert.deepEqual(acciones, ["Ejecutar flujo", "Notificar asesor", "Leer Google Sheets"]);
        // Caso y transición solo en el entrenamiento; la transición, una por paso.
        assert.match(menu, /conCasosYTransicion && \(\s*<CommandItem onSelect=\{addCaso\}/);
        assert.match(menu, /conCasosYTransicion && !yaTieneTransicion/);
    });

    test("un caso: la tabla exacta dentro del bloque, y la transición al final (sin destino → N+1)", () => {
        const b = bloque(md.buildSectionedMarkdown(pasos(), FULL), 1);
        assert.ok(b.includes(TABLA_UNO), b);
        assert.ok(b.endsWith(transicion(2)), b);
        // La tabla, después de la acción y antes de la nota; la transición, detrás de todo.
        assert.ok(b.indexOf("Catálogo") < b.indexOf("| Caso |"));
        assert.ok(b.indexOf("| Caso |") < b.indexOf("NOTA DE CONTROL"));
        assert.ok(b.indexOf("NOTA DE CONTROL") < b.indexOf("➡️ TRANSICIÓN"));
        // Los elementos normales siguen numerados sin huecos: (1) flujo, (2) nota.
        assert.match(b, /- \(1\) > \*\*FUNCIÓN\*\*: Ejecuta el flujo 'Catálogo'/);
        assert.match(b, /- \(2\)\n> \*\*NOTA DE CONTROL/);
        // Con un solo caso no se escribe la frase del orden.
        assert.doesNotMatch(b, /se evalúan en el orden/);
    });

    test("varios casos: UNA tabla, A/B en el orden agregado, el primero que coincide, y el vacío fuera", () => {
        const b = bloque(md.buildSectionedMarkdown(pasos(), FULL), 2);
        assert.equal(b.match(/\| Caso \| Detección \| Acción \|/g).length, 1);
        assert.ok(b.includes("| A | Da su nombre | → Gracias, ¿y tu ciudad? |"), b);
        assert.ok(b.includes("| B | No quiere \\| dar datos | → Sin problema, te ayudo igual |"), b);
        assert.doesNotMatch(b, /\| C \|/, "un caso vacío no es una fila");
        assert.ok(b.includes("aplica el primero cuyo Escenario coincida"), b);
        assert.ok(b.indexOf("se evalúan en el orden") < b.indexOf("Si lo que dice el cliente no coincide"));
        // Destino elegido: Agenda es el paso 4.
        assert.ok(b.endsWith(transicion(4)), b);
    });

    test("transición: último paso sin destino no escribe nada; destino borrado → N+1", () => {
        const s = md.buildSectionedMarkdown(pasos(), FULL);
        assert.ok(bloque(s, 3).endsWith(transicion(4)), "paso 3 sin destino → 4");
        assert.doesNotMatch(bloque(s, 4), /TRANSICIÓN/, "el último paso no tiene siguiente");
    });

    test("los dos constructores escriben la misma tabla y la misma transición", () => {
        const otro = sp.buildSectionedPrompt(pasos(), {
            mode: "training",
            sectionLabel: (n) => `### PASO ${n}`,
            mainMessageLabel: "OBJETIVO",
            elementsLabel: () => "ELEMENTOS:",
            emptyMessage: "",
        });
        assert.ok(otro.includes(TABLA_UNO), otro);
        assert.ok(otro.includes(transicion(2)));
        assert.ok(otro.includes(transicion(4)));
        assert.ok(otro.includes("| B | No quiere \\| dar datos | → Sin problema, te ayudo igual |"));
    });

    test("guardar no los pierde: el esquema conserva escenario, respuesta y destino", () => {
        const c = tipos.PromptElementSchema.parse({ id: "c", kind: "function", fn: "caso", escenario: "E", respuesta: "R" });
        assert.equal(c.escenario, "E");
        assert.equal(c.respuesta, "R");
        const t = tipos.PromptElementSchema.parse({ id: "t", kind: "function", fn: "transicion", destino: "p2" });
        assert.equal(t.destino, "p2");
        assert.equal(t.fn, "transicion");
    });

    test("el orden en el editor: caso con la respuesta, transición antes de la nota", () => {
        const lista = [
            { id: "n", kind: "function", fn: "nota_interna" },
            { id: "t", kind: "function", fn: "transicion" },
            { id: "c", kind: "function", fn: "caso" },
            { id: "r", kind: "text" },
            { id: "f", kind: "function", fn: "ejecutar_flujo" },
        ];
        assert.deepEqual(orden.ordenarElementos(lista).map((e) => e.id), ["f", "c", "r", "t", "n"]);
        const conCaso = orden.insertarElementoEnOrden(
            [{ id: "c1", kind: "function", fn: "caso" }, { id: "t", kind: "function", fn: "transicion" }],
            { id: "c2", kind: "function", fn: "caso" },
        );
        assert.deepEqual(conCaso.map((e) => e.id), ["c1", "c2", "t"], "un caso nuevo va detrás del anterior: el orden agregado");
    });

    test("un paso de los de siempre sale IDÉNTICO al de antes", () => {
        assert.equal(md.buildSectionedMarkdown(legado(), FULL), antes.buildSectionedMarkdown(legado(), FULL));
        for (const modo of ["answer", "management"]) {
            const cfg = { ...FULL, renderMode: modo };
            assert.equal(md.buildSectionedMarkdown(legado(), cfg), antes.buildSectionedMarkdown(legado(), cfg), modo);
        }
    });

    // ── Preguntas, Productos y Extras ─────────────────────────────────────
    const pestanas = await import(join(COMP, "pestanas.mjs"));
    const componer = await import(join(COMP, "componer.mjs"));
    const inicio = () => [
        { id: "i1", title: "Bienvenida", mainMessage: "Hola", elements: [] },
        { id: "i2", title: "Datos", mainMessage: "Pide datos", elements: [] },
        { id: "i3", title: "Agenda", mainMessage: "Agenda", elements: [] },
    ];
    const pregunta = (destino, extra = []) => ({
        steps: [{
            id: "q1",
            title: "¿Cuánto cuesta?",
            mainMessage: "Depende del plan.",
            elements: [
                { id: "c", kind: "function", fn: "caso", escenario: "Pregunta por el plan básico", respuesta: "Cuesta 50" },
                { id: "t", kind: "function", fn: "transicion", destino },
                ...extra,
            ],
        }],
    });
    const TABLA_PREGUNTA = "| A | Pregunta por el plan básico | → Cuesta 50 |";

    test("fuera de Inicio: la transición va al paso de INICIO elegido, en las tres pestañas", () => {
        for (const [nombre, f] of [["faq", pestanas.buildFaqMarkdown], ["products", pestanas.buildProductsMarkdown], ["extras", pestanas.buildExtrasMarkdown]]) {
            const s = f(pregunta("i3"), inicio());
            assert.ok(s.includes(TABLA_PREGUNTA), `${nombre}: ${s}`);
            assert.ok(s.includes(transicion(3)), `${nombre}: ${s}`);
        }
    });

    test("fuera de Inicio no hay «siguiente»: sin destino, o con uno borrado, no se escribe transición", () => {
        for (const destino of [null, "borrado"]) {
            const s = pestanas.buildFaqMarkdown(pregunta(destino), inicio());
            assert.ok(s.includes(TABLA_PREGUNTA), s);
            assert.doesNotMatch(s, /TRANSICIÓN/, String(destino));
        }
        // Y sin pasos de Inicio no hay a dónde ir.
        assert.doesNotMatch(pestanas.buildProductsMarkdown(pregunta("i1"), []), /TRANSICIÓN/);
    });

    test("el prompt final: componer le pasa a las tres pestañas los pasos de Inicio", () => {
        const sections = {
            business: { nombre: "Café de la Montaña" },
            training: { steps: inicio() },
            faq: pregunta("i2"),
            products: { steps: [{ ...pregunta("i3").steps[0], id: "p1", title: "Plan" }] },
            extras: { steps: [{ ...pregunta(null).steps[0], id: "x1", title: "Horario" }] },
        };
        const s = componer.composePromptFromSections(sections);
        assert.ok(s.includes(transicion(2)), "la pregunta → Datos (2)");
        assert.ok(s.includes(transicion(3)), "el producto → Agenda (3)");
        assert.ok(s.includes(TABLA_PREGUNTA));
    });

    test("el otro constructor resuelve igual con pasosDelInicio", () => {
        const s = sp.buildSectionedPrompt(pregunta("i2").steps, {
            mode: "faq",
            sectionLabel: (n) => `### PREGUNTA ${n}`,
            mainMessageLabel: "RESPUESTA",
            elementsLabel: () => "ELEMENTOS:",
            emptyMessage: "",
            pasosDelInicio: inicio(),
        });
        assert.ok(s.includes(TABLA_PREGUNTA), s);
        assert.ok(s.includes(transicion(2)), s);
    });

    test("las tres pestañas ofrecen caso y transición, y eligen entre los pasos de Inicio; Gestión no", () => {
        for (const rel of PESTANAS) {
            const f = fs.readFileSync(join(RAIZ, rel), "utf8");
            assert.match(f, /<FunctionSelector[\s\S]{0,800}conCasosYTransicion/, rel);
            assert.match(f, /updateCaso=\{updateCaso\}/, rel);
            assert.match(f, /updateTransicion=\{updateTransicion\}/, rel);
            assert.match(f, /pasosDelInicio=\{pasosDelInicio\}/, rel);
            assert.match(f, /useMemo\(\(\) => build\w+Markdown\([^)]*\)?, pasosDelInicio\)/, rel);
        }
        const main = fs.readFileSync(join(RAIZ, "app/(root)/ai/_components/MainAi.tsx"), "utf8");
        assert.match(main, /onPasosChange=\{setPasosDelInicio\}/);
        assert.equal((main.match(/pasosDelInicio=\{pasosDelInicio\}/g) ?? []).length, 3);
        const gestion = fs.readFileSync(join(RAIZ, "app/(root)/ai/_components/ManagementBuilder.tsx"), "utf8");
        assert.doesNotMatch(gestion, /conCasosYTransicion/, "Gestión solo captura datos");
        const tarjeta = fs.readFileSync(join(RAIZ, "app/(root)/ai/_components/action-steeps/ElementRenderer.tsx"), "utf8");
        assert.match(tarjeta, /fueraDeInicio=\{!!pasosDelInicio\}/);
    });
}
