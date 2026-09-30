/**
 * El banco de la PANTALLA de Mis datos (`/my-data`): lo que se arregló al
 * documentarla. Dos mitades, sin base ni navegador:
 *
 *   1. **Las reglas**, puras (`lib/pantalla-de-mis-datos.ts` y
 *      `lib/url-de-google-sheets.ts`): el separador que de verdad parte el
 *      texto, la dirección del CSV con su pestaña, la fuente y las columnas en
 *      español, el pie de la tabla y la paginación.
 *   2. **Un barrido del código**: las dos opciones —Google Sheets y la Base de
 *      conocimiento— se pintan con las MISMAS piezas (sus pestañas, su «⋯» y
 *      el lápiz y la papelera de cada fila), ninguna escribe a mano lo que dice
 *      `lib/pantalla-de-mis-datos.ts`, y ningún `catch` se queda mudo.
 *
 * `MODO=roto` lee los ficheros de `ANTES_MIS_DATOS_REF` —pinchado a un commit,
 * nunca `origin/main`— y AFIRMA los fallos: el separador «Línea en blanco
 * doble» viajaba como cuatro caracteres y no partía nada, la dirección del CSV
 * se armaba con un `gid` vacío o con un `#heading=…` dentro, la cabecera decía
 * «Mis Datos Externos», las pestañas se llamaban distinto en cada opción, el
 * «⋯» de Google Sheets contaba desde otra pestaña, y la tabla escondía el lápiz
 * y la papelera detrás de un «⋯» mientras la lista de bloques los enseñaba.
 *
 * Se levanta con `scripts/banco-pantalla-de-mis-datos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_MIS_DATOS_REF ?? "ab6b110";

const D = "app/(root)/my-data/_components";
const ADMIN = "app/(root)/(protected)/admin/external-data/_components";

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

/** Sin comentarios: la explicación de un arreglo no puede tumbar el banco que lo protege. */
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** El `catch` que no hace nada: se traga el fallo y la pantalla parece lenta o vacía. */
const CATCH_MUDO = /catch\s*(\([^)]*\))?\s*\{\s*\}/;

if (ROTO) {
    test("ANTES: «Línea en blanco doble» viajaba como cuatro caracteres, y no partía nada", () => {
        const imp = leer(`${D}/KnowledgeBaseImport.tsx`);
        assert.ok(imp, `ANTES_MIS_DATOS_REF (${ANTES}) no tiene la pantalla de Mis datos`);
        // En un atributo de JSX la barra invertida NO es un escape: el valor
        // que llegaba al servidor era «\», «n», «\», «n».
        assert.ok(imp.includes('value="\\n\\n"'), "el separador ya no llevaba \\n\\n escrito en el JSX");
        const valor = /<SelectItem value="(\\n\\n)"/.exec(imp)[1];
        assert.equal(valor.length, 4, "el valor del atributo no eran cuatro caracteres");
        assert.ok(!"### Uno\n\n### Dos".includes(valor), "el separador viejo sí aparecía en un texto con líneas en blanco");
    });

    test("ANTES: la dirección del CSV mandaba un gid vacío, o un #heading entero", () => {
        const acciones = leer("actions/external-client-data-actions.ts");
        const fuente = /function buildGoogleSheetsCsvUrl\(sheetUrl: string\): string \| null \{([\s\S]*?)\n\}/.exec(acciones);
        assert.ok(fuente, "no estaba buildGoogleSheetsCsvUrl");
        // eslint-disable-next-line no-new-func
        const armar = new Function("sheetUrl", fuente[1]);
        const hoja = "https://docs.google.com/spreadsheets/d/1abc/edit";
        assert.equal(armar(hoja), "https://docs.google.com/spreadsheets/d/1abc/export?format=csv&gid=", "sin pestaña ya no salía un gid vacío");
        assert.match(armar(`${hoja}#heading=h.1`), /gid=#heading=h\.1$|gid=heading=h\.1$|gid=#?heading/, "un #heading ya no se colaba en el gid");
    });

    test("ANTES: la cabecera no se llamaba como el menú, y las pestañas se llamaban distinto en cada opción", () => {
        assert.match(leer(`${D}/MyDataContent.tsx`), /Mis Datos Externos/);
        const kb = leer(`${D}/KnowledgeBaseSection.tsx`);
        assert.match(kb, /Importar contenido/);
        assert.match(kb, /Gestionar bloques/);
        assert.doesNotMatch(leer(`${D}/MyDataContent.tsx`), /Gestionar bloques/);
    });

    test("ANTES: el «⋯» de Google Sheets contaba lo que le pasaba la pestaña Gestionar", () => {
        const menu = leer(`${D}/MyDataActionsMenu.tsx`);
        assert.match(menu, /total: number/, "el menú ya contaba por su cuenta");
        assert.doesNotMatch(menu, /contarExternalClientData/);
    });

    test("ANTES: la tabla pintaba la forma de WhatsApp, e importar buscaba el cliente solo por la forma canónica", () => {
        assert.match(leer(`${ADMIN}/ExternalClientDataColumns.tsx`), /\{row\.getValue\('remoteJid'\)\}/, "ya enseñaba solo el número");
        const acciones = leer("actions/external-client-data-actions.ts");
        assert.doesNotMatch(acciones, /elRegistroDelMismoNumero|lasFormasDelMismoNumero/);
        const importar = /export async function importExternalClientDataBulk[\s\S]*?\n\}/.exec(acciones)[0];
        assert.match(importar, /findUnique\(\{\s*where: \{ userId_remoteJid: \{ userId, remoteJid: canonicalJid \} \}/, "ya buscaba por más de una forma");
        assert.match(importar, /\} catch \{\s*errors\+\+;\s*\}/, "una fila que no entraba ya decía por qué");
        const guardar = /export async function upsertExternalClientData[\s\S]*?\n\}/.exec(acciones)[0];
        assert.match(guardar, /normalizeWhatsAppConversationJid\(remoteJid\) \|\| remoteJid/, "guardar a mano ya distinguía un SKU de un número");
    });

    test("ANTES: «Ver columnas» sacaba un aviso de «N columnas detectadas» encima del botón de importar", () => {
        assert.match(leer(`${D}/MyDataImport.tsx`), /toast\.success\(`\$\{res\.headers\.length\} columnas detectadas`\)/, "ya no sacaba el aviso");
    });

    test("ANTES: un bloque importado guardaba su «### título» dentro del contenido", () => {
        const acciones = leer("actions/knowledge-block-actions.ts");
        assert.match(acciones, /const content = chunk;/, "ya quitaba el título del contenido");
        assert.match(acciones, /chunks = rawText\.split\(separator\)/, "«Encabezados Markdown» ya partía por la línea");
    });

    test("ANTES: el título de un bloque se pintaba y se guardaba en MAYÚSCULAS al editarlo", () => {
        const kb = leer(`${D}/KnowledgeBaseManagement.tsx`);
        assert.match(kb, /title: e\.target\.value\.toUpperCase\(\)/, "ya no lo convertía al teclear");
        assert.match(kb, /className="text-sm uppercase"/, "ya no lo pintaba en mayúsculas");
    });

    test("ANTES: la tabla escondía el lápiz y la papelera detrás de un «⋯»; la lista de bloques no", () => {
        const tabla = leer(`${ADMIN}/ExternalClientDataColumns.tsx`);
        assert.match(tabla, /MoreHorizontal/);
        assert.match(tabla, /DropdownMenuItem/);
        const bloques = leer(`${D}/KnowledgeBaseManagement.tsx`);
        assert.doesNotMatch(bloques, /DropdownMenuItem/, "la lista de bloques también usaba un menú");
        assert.doesNotMatch(bloques + tabla, /EditarYEliminar/);
    });
} else {
    const reglas = await import(path.join(RAIZ, "lib/__tests__/.compilado/pantalla-de-mis-datos/pantalla-de-mis-datos.mjs"));
    const urls = await import(path.join(RAIZ, "lib/__tests__/.compilado/pantalla-de-mis-datos/url-de-google-sheets.mjs"));

    test("el separador parte de verdad: «Línea en blanco doble» son dos saltos de línea", () => {
        assert.equal(reglas.elSeparador("auto"), undefined);
        assert.equal(reglas.elSeparador("encabezados"), "###");
        assert.equal(reglas.elSeparador("linea-divisoria"), "---");
        assert.equal(reglas.elSeparador("linea-en-blanco"), "\n\n");
        assert.equal(reglas.elSeparador("linea-en-blanco").length, 2);
        assert.equal(reglas.elSeparador("\\n\\n"), undefined, "un valor que no está en la lista cae en «automático»");
        for (const s of reglas.SEPARADORES_DE_LA_BASE) {
            assert.ok(!s.valor.includes("\\"), `el valor «${s.valor}» lleva una barra: en un atributo no se interpreta`);
        }
        assert.ok("### Uno\n\n### Dos".split(reglas.elSeparador("linea-en-blanco")).length === 2);
    });

    test("la dirección del CSV: siempre docs.google.com, y la pestaña solo si son dígitos", () => {
        const hoja = "https://docs.google.com/spreadsheets/d/1abc/edit";
        const csv = "https://docs.google.com/spreadsheets/d/1abc/export?format=csv";
        assert.equal(urls.laUrlDelCsv(hoja), csv, "sin pestaña no se manda gid: Google exporta la primera");
        assert.equal(urls.laUrlDelCsv(`${hoja}#gid=123`), `${csv}&gid=123`);
        assert.equal(urls.laUrlDelCsv(`${hoja}?gid=45#gid=45`), `${csv}&gid=45`);
        assert.equal(urls.laUrlDelCsv(`${hoja}#heading=h.1`), csv, "un #heading no es una pestaña");
        assert.equal(urls.laUrlDelCsv(`${hoja}?gid=abc`), csv);
        assert.equal(urls.laUrlDelCsv("https://otro.com/spreadsheets/d/1abc/edit"), csv, "el servidor lo decide la App, no quien pega");
        assert.equal(urls.laUrlDelCsv("https://docs.google.com/document/d/1abc/edit"), null);
        assert.equal(urls.laUrlDelCsv(""), null);
        assert.equal(urls.laUrlDelCsv("no es una url"), null);
    });

    test("la fuente, las columnas y la columna clave se dicen en español, y lo que no se sabe no se inventa", () => {
        assert.equal(reglas.laFuente("google_sheets"), "Google Sheets");
        assert.equal(reglas.laFuente("manual"), "Manual");
        assert.equal(reglas.laFuente(null), "Manual");
        assert.equal(reglas.laFuente("zapier"), "zapier");
        assert.equal(reglas.laEtiquetaDeLaColumna("remoteJid"), "WhatsApp o clave");
        assert.equal(reglas.laEtiquetaDeLaColumna("updatedAt"), "Actualizado");
        assert.equal(reglas.laEtiquetaDeLaColumna("otra"), "otra");
        assert.notEqual(reglas.laEtiquetaDeLaColumnaClave(true), reglas.laEtiquetaDeLaColumnaClave(false));
        assert.match(reglas.laEtiquetaDeLaColumnaClave(false), /WhatsApp/);
        assert.doesNotMatch(reglas.laEtiquetaDeLaColumnaClave(true), /WhatsApp/, "en modo catálogo la clave no es un número de WhatsApp");
    });

    test("el pie dice cuántos hay DELANTE, y cargar más no repite ninguno", () => {
        assert.equal(reglas.REGISTROS_POR_PAGINA, 200);
        assert.equal(reglas.elPieDeLaTabla({ cargados: 200, total: 350, pagina: 1, paginas: 20 }), "200 de 350 registro(s) · página 1 de 20");
        assert.equal(reglas.elPieDeLaTabla({ cargados: 350, total: 350, pagina: 3, paginas: 35 }), "350 registro(s) · página 3 de 35");
        assert.equal(reglas.elPieDeLaTabla({ cargados: 0, total: 0, pagina: 1, paginas: 0 }), "0 registro(s) · página 1 de 1");
        assert.equal(reglas.quedanPorCargar(200, 350), 150);
        assert.equal(reglas.quedanPorCargar(400, 350), 0);
        const juntos = reglas.juntarLosRegistros([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]);
        assert.deepEqual(juntos.map((r) => r.id), [1, 2, 3]);
    });

    test("las dos opciones se pintan con las MISMAS piezas: pestañas, «⋯» y el lápiz y la papelera", () => {
        const sheets = leer(`${D}/MyDataContent.tsx`);
        const base = leer(`${D}/KnowledgeBaseSection.tsx`);
        assert.match(sheets, /<PestanasDeLaSeccion\s+seccion="sheets"/);
        assert.match(base, /<PestanasDeLaSeccion\s+seccion="knowledge"/);
        for (const f of [sheets, base]) assert.doesNotMatch(f, /<TabsTrigger/, "una opción vuelve a pintar sus pestañas a mano");
        assert.match(leer(`${D}/MyDataActionsMenu.tsx`), /<BotonDelMenuDeLaSeccion seccion="sheets"/);
        assert.match(leer(`${D}/KnowledgeBaseActionsMenu.tsx`), /<BotonDelMenuDeLaSeccion seccion="knowledge"/);
        // El lápiz y la papelera de cada fila: el MISMO componente en las dos listas.
        const tabla = leer(`${ADMIN}/ExternalClientDataColumns.tsx`);
        const bloques = leer(`${D}/KnowledgeBaseManagement.tsx`);
        assert.match(tabla, /<EditarYEliminar /);
        assert.match(bloques, /<EditarYEliminar /);
        assert.doesNotMatch(tabla, /DropdownMenu|MoreHorizontal/, "la tabla vuelve a esconder sus acciones detrás de un «⋯»");
        assert.doesNotMatch(bloques, /<Edit2|<Trash2/, "la lista de bloques vuelve a pintar sus botones a mano");
    });

    test("ningún componente escribe a mano lo que dice lib/pantalla-de-mis-datos", () => {
        const todo = readdirSync(path.join(RAIZ, D))
            .filter((n) => n.endsWith(".tsx"))
            .map((n) => sinComentarios(readFileSync(path.join(RAIZ, D, n), "utf8")))
            .join("\n");
        assert.doesNotMatch(todo, /Mis Datos Externos/, "la cabecera vuelve a no llamarse como el menú");
        assert.doesNotMatch(todo, /value="\\n\\n"/, "vuelve el separador que no partía nada");
        assert.doesNotMatch(todo, /Importar contenido|Gestionar bloques|Base de Conocimiento/, "un nombre escrito a mano, distinto del de la otra opción");
        assert.match(leer(`${D}/MyDataActionsMenu.tsx`), /contarExternalClientData/, "el «⋯» de Google Sheets vuelve a depender de otra pestaña para su número");
        assert.match(leer("actions/external-client-data-actions.ts"), /laUrlDelCsv\(/);
        assert.doesNotMatch(leer("actions/external-client-data-actions.ts"), /buildGoogleSheetsCsvUrl/);
    });

    test("la tabla enseña el NÚMERO, y el mismo cliente se busca por todas las formas de su número", () => {
        assert.equal(reglas.laClaveQueSeLee("573004522013@s.whatsapp.net"), "573004522013");
        assert.equal(reglas.laClaveQueSeLee("573004522013@c.us"), "573004522013");
        assert.equal(reglas.laClaveQueSeLee("SKU-001"), "SKU-001", "la clave de un catálogo sale tal cual");
        assert.equal(reglas.laClaveQueSeLee("123456789012345@lid"), "123456789012345@lid", "un @lid no es un número");
        assert.equal(reglas.laClaveQueSeLee(null), "");
        assert.deepEqual(reglas.lasFormasDelMismoNumero("573004522013@s.whatsapp.net"), [
            "573004522013@s.whatsapp.net",
            "573004522013",
            "573004522013@c.us",
        ]);
        for (const forma of reglas.lasFormasDelMismoNumero("573004522013@s.whatsapp.net")) {
            assert.ok(!forma.endsWith("@lid"), "nunca se fabrica un @lid: sus dígitos no son un teléfono");
        }
        assert.deepEqual(reglas.lasFormasDelMismoNumero("SKU-001"), ["SKU-001"], "una clave de catálogo solo es igual a sí misma");
        assert.deepEqual(reglas.lasFormasDelMismoNumero(""), []);
    });

    test("solo un NÚMERO pasa a su forma de WhatsApp: el SKU de un catálogo se queda como se escribió", () => {
        for (const n of ["573004522013", "+57 300 452 2013", "(300) 452-2013", "573004522013@s.whatsapp.net", "123@lid"]) {
            assert.ok(reglas.esUnNumeroDeWhatsApp(n), `«${n}» es un número`);
        }
        for (const c of ["SKU-001", "MEDIDA 205/55R16", "CÓDIGO 12", "12345", ""]) {
            assert.ok(!reglas.esUnNumeroDeWhatsApp(c), `«${c}» no es un número`);
        }
    });

    test("importar y guardar a mano buscan el registro por TODAS las formas del número, y lo dicen si una fila no entra", () => {
        const acciones = sinComentarios(leer("actions/external-client-data-actions.ts"));
        assert.match(acciones, /async function elRegistroDelMismoNumero\(/);
        assert.match(acciones, /lasFormasDelMismoNumero\(canonicalJid\)/);
        const importar = /export async function importExternalClientDataBulk[\s\S]*?\n\}/.exec(acciones)[0];
        assert.match(importar, /elRegistroDelMismoNumero\(userId, canonicalJid\)/, "la importación vuelve a buscar solo por la forma canónica");
        assert.match(importar, /console\.warn\('\[mis-datos\] una fila de la importación no se pudo guardar'/, "una fila que no entra vuelve a callarse");
        const guardar = /export async function upsertExternalClientData[\s\S]*?\n\}/.exec(acciones)[0];
        assert.match(guardar, /esUnNumeroDeWhatsApp\(clave\)/, "guardar a mano vuelve a pasar la clave de un catálogo por la regla del número");
        assert.match(guardar, /elRegistroDelMismoNumero/);
        assert.match(leer(`${ADMIN}/ExternalClientDataColumns.tsx`), /laClaveQueSeLee\(row\.getValue\('remoteJid'\)\)/, "la tabla vuelve a pintar la forma de WhatsApp");
    });

    test("«Ver columnas» no saca un aviso: la cifra se lee debajo del selector, y el aviso tapaba «Iniciar importación»", () => {
        const imp = sinComentarios(leer(`${D}/MyDataImport.tsx`));
        assert.doesNotMatch(imp, /toast\.success\([^)]*columnas detectadas/, "el aviso vuelve a salir encima del botón de importar");
        assert.match(imp, /\{previewHeaders\.length\} columnas detectadas/, "la cifra dejó de leerse debajo del selector");
    });

    test("el título de un bloque se guarda TAL CUAL se escribe, como los importados", () => {
        const kb = sinComentarios(leer(`${D}/KnowledgeBaseManagement.tsx`));
        const campo = /id="kb-title"[\s\S]*?\/>/.exec(kb)?.[0] ?? "";
        assert.ok(campo, "no se encontró el campo del título");
        assert.doesNotMatch(campo, /toUpperCase/, "el título vuelve a guardarse en mayúsculas al teclear");
        assert.doesNotMatch(campo, /\buppercase\b/, "el título vuelve a pintarse en mayúsculas: lo que se ve no es lo que se guarda");
    });

    test("un bloque importado guarda su contenido SIN la línea de su título", () => {
        const c = reglas.elContenidoSinElTitulo;
        assert.equal(c("### Horario de fin de año\nDel 24 al 31 atendemos de 9 a 2."), "Del 24 al 31 atendemos de 9 a 2.");
        assert.equal(c("\n\n## Envíos\n\nA todo el país.\nGratis desde $150.000.\n"), "A todo el país.\nGratis desde $150.000.");
        // Partiendo por --- o líneas en blanco la primera línea es texto, y se queda.
        assert.equal(c("Horarios\nDe lunes a viernes."), "Horarios\nDe lunes a viernes.");
        assert.equal(c("#hashtag no es un encabezado"), "#hashtag no es un encabezado");
        // Un encabezado solo: el contenido es el título sin la marca, nunca vacío.
        assert.equal(c("### Tarjeta de regalo"), "Tarjeta de regalo");
        assert.equal(c(""), "");
        // «Encabezados Markdown» parte en la LÍNEA que empieza por ###, no en cualquier ###.
        const trozos = "Intro\n### Uno\nA ### B\n### Dos\nC".split(reglas.ANTES_DE_CADA_ENCABEZADO);
        assert.deepEqual(trozos, ["Intro\n", "### Uno\nA ### B\n", "### Dos\nC"]);
    });

    test("importar a la base usa esa regla, y «Encabezados Markdown» parte como la detección automática", () => {
        const acciones = sinComentarios(leer("actions/knowledge-block-actions.ts"));
        assert.match(acciones, /const content = elContenidoSinElTitulo\(chunk\)/, "el contenido vuelve a llevar el «### título» dentro");
        assert.match(acciones, /if \(separator === '###'\) \{\s*chunks = rawText\.split\(ANTES_DE_CADA_ENCABEZADO\)/, "«Encabezados Markdown» vuelve a partir por cualquier ###");
        assert.doesNotMatch(acciones, /split\(\/\(\?=\^###/, "la regla de partir por encabezados vuelve a estar escrita dos veces");
    });

    test("ningún catch mudo en la pantalla ni en sus acciones", () => {
        const ficheros = [
            ...readdirSync(path.join(RAIZ, D)).map((n) => `${D}/${n}`),
            ...readdirSync(path.join(RAIZ, ADMIN)).map((n) => `${ADMIN}/${n}`),
            "actions/external-client-data-actions.ts",
            "components/shared/EditarYEliminar.tsx",
        ];
        const mudos = ficheros.filter((f) => CATCH_MUDO.test(leer(f)));
        assert.deepEqual(mudos, [], "un catch que se traga el fallo");
    });
}
