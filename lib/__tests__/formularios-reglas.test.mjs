/**
 * Las reglas de Mis formularios (`lib/formularios.ts`) y un BARRIDO del código
 * que dice si las pantallas pasan por ellas.
 *
 * `MODO=roto` lee los mismos ficheros de un commit pinchado (`ANTES_REF`) y
 * AFIRMA los fallos que tenían: el formulario público mandaba al login, la
 * pantalla pedía un rol que el equipo no tiene, la variable de WhatsApp se
 * sustituía con una expresión regular armada con la pregunta —que con «¿…?»
 * no casa nunca— y la pestaña de la hoja se buscaba letra a letra.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "ab6b110";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

const leer = (ruta) =>
    ROTO
        ? execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], { cwd: RAIZ, encoding: "utf8" })
        : readFileSync(join(RAIZ, ruta), "utf8");
const existe = (ruta) => {
    if (!ROTO) return existsSync(join(RAIZ, ruta));
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:${ruta}`], { cwd: RAIZ, stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PANTALLA = "app/(root)/(protected)/mis-formularios";
const PUBLICA = "app/(public)/f/[slug]/[formSlug]/_components/PublicFormClient.tsx";
const EDITOR = `${PANTALLA}/[formId]/_components/FormEditorClient.tsx`;

// ── Las reglas (solo existen desde el arreglo) ───────────────────────────────

const r = ROTO ? null : await import("./.compilado/formularios/formularios.js");

test("la variable de WhatsApp se sustituye aunque la pregunta lleve «¿?», «(» o «.»", { skip: ROTO }, () => {
    const campos = [
        { id: "a", label: "¿Cómo te llamas?" },
        { id: "b", label: "Monto (COP)" },
        { id: "c", label: "Servicios" },
    ];
    const plantilla = "Hola {{¿Cómo te llamas?}}, pagas {{Monto (COP)}} por {{Servicios}}. {{¿Cómo te llamas?}}";
    assert.equal(
        r.elMensajeDeWhatsapp(plantilla, campos, { a: "Ana", b: 50000, c: ["Corte", "Tinte"] }),
        "Hola Ana, pagas 50000 por Corte, Tinte. Ana",
    );
    assert.equal(r.elMensajeDeWhatsapp("{{Monto (COP)}}", campos), "[Monto (COP)]", "sin respuestas, la vista previa");
    assert.equal(
        r.elEnlaceDeWhatsapp("+57 300 111 2233", "Hola {{Servicios}}", campos, { c: "Corte" }),
        "https://api.whatsapp.com/send?phone=573001112233&text=Hola%20Corte",
    );
    assert.equal(r.elEnlaceDeWhatsapp("", "Hola", campos), null, "sin número no hay enlace");
    assert.equal(r.elEnlaceDeWhatsapp("573", "   ", campos), null, "sin mensaje tampoco");
});

test("ANTES: la expresión regular armada con la pregunta no sustituía «¿Cómo te llamas?»", () => {
    // El código de antes, literal: `msg.replace(new RegExp(`\\{\\{${label}\\}\\}`, 'g'), valor)`.
    const deAntes = (msg, label, valor) => msg.replace(new RegExp(`\\{\\{${label}\\}\\}`, "g"), valor);
    assert.equal(deAntes("Hola {{¿Cómo te llamas?}}", "¿Cómo te llamas?", "Ana"), "Hola {{¿Cómo te llamas?}}");
    assert.throws(() => deAntes("{{Pago (}}", "Pago (", "x"), "y con un paréntesis suelto, reventaba");
});

test("la pestaña de la hoja se encuentra sin mirar mayúsculas ni espacios, y su rango se escapa", { skip: ROTO }, () => {
    assert.deepEqual(r.laPestanaDelFormulario("PROCESO DE ATENCION", ["Hoja 1", "Proceso de atencion "]), {
        nombre: "Proceso de atencion ",
        existe: true,
    });
    assert.deepEqual(r.laPestanaDelFormulario("Nuevo", ["Hoja 1"]), { nombre: "Nuevo", existe: false });
    assert.equal(r.laPestanaDelFormulario("  ", []).nombre, "Registros");
    assert.equal(r.laPestanaDelFormulario("x".repeat(150), []).nombre.length, r.TOPE_DEL_NOMBRE_DE_PESTANA);
    assert.equal(r.elRangoDeLaPestana("Registro d'Anna", "A1"), "'Registro d''Anna'!A1");
});

test("el enlace conserva la letra de una tilde, y es el de la cuenta dueña", { skip: ROTO }, () => {
    assert.equal(r.elSlugDelFormulario("Inscripción de Clientes"), "inscripcion-de-clientes");
    assert.equal(r.elSlugDelFormulario("  ¿Qué tal?  "), "que-tal");
    assert.equal(r.elSlugDelFormulario("!!!"), "");
    assert.equal(r.elEnlaceDelFormulario({ userId: "u1", slug: "contacto", publicSlug: null }), "/f/u1/contacto");
    assert.equal(r.elEnlaceDelFormulario({ userId: "u1", slug: "contacto", publicSlug: "mi-clinica" }), "/f/mi-clinica");
});

test("una respuesta se lee igual en el CSV, la hoja y el mensaje", { skip: ROTO }, () => {
    assert.equal(r.comoSeLeeLaRespuesta(["a", "b"]), "a, b");
    assert.equal(r.comoSeLeeLaRespuesta(true), "Sí");
    assert.equal(r.comoSeLeeLaRespuesta(false), "No");
    assert.equal(r.comoSeLeeLaRespuesta({ url: "http://x/y.pdf" }), "http://x/y.pdf");
    assert.equal(r.comoSeLeeLaRespuesta(null), "");
    assert.equal(r.comoSeLeeLaRespuesta(12), "12");
    const campos = [{ id: "a", label: "Nombre" }, { id: "b", label: "Acepto" }];
    assert.deepEqual(r.laCabeceraDeLaHoja(campos), ["ID", "Fecha", "Nombre", "Acepto"]);
    assert.deepEqual(r.laFilaDelRegistro(campos, { a: "Ana", b: true, z: "borrado" }, "id1", "hoy"), ["id1", "hoy", "Ana", "Sí"]);
});

test("lo que se guarda de un envío: solo sus campos, sus obligatorios y sus archivos", { skip: ROTO }, () => {
    const pre = "https://s3/verzay-media/formularios/F1/";
    const campos = [
        { id: "n", label: "Nombre", type: "text", required: true },
        { id: "k", label: "Acepto", type: "checkbox", required: false },
        { id: "m", label: "Servicios", type: "multiselect", required: false },
        { id: "d", label: "Documento", type: "file", required: false },
    ];
    const ok = r.lasRespuestasQueSeGuardan(campos, { n: "Ana", k: "true", m: ["a", 3, "b"], extra: "x" }, pre);
    assert.deepEqual(ok, { ok: true, respuestas: { n: "Ana", k: true, m: ["a", "b"], d: "" } });
    assert.deepEqual(r.lasRespuestasQueSeGuardan(campos, { n: "  " }, pre), { ok: false, error: "Falta responder «Nombre»." });
    assert.equal(r.lasRespuestasQueSeGuardan(campos, { n: "A", d: "https://otro/x.pdf" }, pre).ok, false);
    assert.equal(r.lasRespuestasQueSeGuardan(campos, { n: "A", d: `${pre}../../x.pdf` }, pre).ok, false);
    assert.equal(r.lasRespuestasQueSeGuardan(campos, { n: "A", d: `${pre}abc.pdf` }, pre).ok, true);
    const largo = r.lasRespuestasQueSeGuardan(campos, { n: "x".repeat(9000) }, pre);
    assert.equal(largo.respuestas.n.length, r.TOPE_DE_LA_RESPUESTA);
    assert.equal(r.lasRespuestasQueSeGuardan(campos, "no es un objeto", pre).ok, false);
});

test("los conteos, el resumen y la extensión de un archivo", { skip: ROTO }, () => {
    assert.deepEqual(
        r.losConteosDeRegistros([{ syncStatus: "SYNCED", _count: 7 }, { syncStatus: "ERROR", _count: 2 }, { syncStatus: "PENDING", _count: 1 }]),
        { total: 10, sincronizados: 7, pendientes: 1, conError: 2 },
    );
    const campos = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    assert.equal(r.elResumenDelRegistro(campos, { a: "Ana", b: "", c: true, d: "x", z: "borrado" }), "Ana | Sí | x");
    assert.equal(r.elResumenDelRegistro(campos, { a: "1", b: "2", c: "3", d: "4" }), "1 | 2 | 3 | …");
    assert.equal(r.laExtensionDelArchivo("Contrato.PDF"), ".pdf");
    assert.equal(r.laExtensionDelArchivo("sin-extension"), "");
    assert.equal(r.laExtensionDelArchivo("x.<script>"), "");
    assert.equal(r.laCarpetaDelFormulario("F1"), "formularios/F1/");
});

test("los catorce tipos de campo, en el orden del desplegable", { skip: ROTO }, () => {
    assert.deepEqual(r.TIPOS_DE_CAMPO.map((t) => t.tipo), [
        "text", "textarea", "select", "radio", "multiselect", "checkbox", "file",
        "number", "money", "date", "time", "email", "phone", "url",
    ]);
    assert.equal(r.esTipoDeCampo("inventado"), false);
    assert.deepEqual([...r.TIPOS_CON_OPCIONES], ["select", "radio", "multiselect"]);
});

// ── El barrido: que las pantallas pasen por las reglas ───────────────────────

test("el formulario público y su subida de archivos se abren sin sesión", () => {
    const mw = sinComentarios(leer("middleware.ts"));
    const publica = /currentPath\.startsWith\("\/f\/"\)/.test(mw);
    const subida = /"\/api\/upload-form-file"/.test(mw);
    if (ROTO) {
        assert.equal(publica, false, "ANTES: /f/ mandaba al login a quien llenaba el formulario");
        assert.equal(subida, false, "ANTES: la subida de archivos también");
        return;
    }
    assert.ok(publica, "/f/ tiene que ser pública");
    assert.ok(subida, "la subida de archivos del formulario tiene que tener su prefijo");
    const ruta = sinComentarios(leer("app/api/upload-form-file/route.ts"));
    assert.match(ruta, /formData\.get\('formId'\)/, "la subida pide el formulario");
    assert.match(ruta, /isActive/, "y que esté activo");
    assert.match(ruta, /laCarpetaDelFormulario\(form\.id\)/, "y guarda en SU carpeta");
});

test("las tres pantallas no piden un rol: la puerta está en las acciones", () => {
    const paginas = [`${PANTALLA}/page.tsx`, `${PANTALLA}/[formId]/page.tsx`, `${PANTALLA}/[formId]/registros/page.tsx`];
    const conRol = paginas.filter((p) => /isAdminOrReseller\(/.test(sinComentarios(leer(p))));
    if (ROTO) {
        assert.equal(conRol.length, 3, "ANTES: las tres pedían admin o reseller, y el equipo se crea con rol user");
        return;
    }
    assert.deepEqual(conRol, []);
});

test("WhatsApp: el editor y la página pública usan la MISMA sustitución", () => {
    const publica = sinComentarios(leer(PUBLICA));
    const editor = sinComentarios(leer(EDITOR));
    if (ROTO) {
        assert.match(publica, /new RegExp\(/, "ANTES: la página pública armaba una expresión regular con la pregunta");
        return;
    }
    for (const [nombre, src] of [["la página pública", publica], ["el editor", editor]]) {
        assert.doesNotMatch(src, /new RegExp\(/, `${nombre} no arma expresiones regulares con la pregunta`);
        assert.match(src, /elEnlaceDeWhatsapp\(/, `${nombre} pasa por elEnlaceDeWhatsapp`);
    }
    assert.match(publica, /append\('formId'/, "la subida manda el formulario");
});

test("ninguna acción de formularios resuelve la persona a mano ni queda sin puerta", () => {
    const acciones = sinComentarios(leer("actions/forms-actions.ts"));
    if (ROTO) {
        assert.match(acciones, /currentUser\(\)/, "ANTES: cada acción iba con user.id");
        assert.equal(existe("actions/form-name-actions.ts"), true, "ANTES: había una acción que daba el nombre de cualquier formulario sin sesión");
        return;
    }
    assert.doesNotMatch(acciones, /currentUser\(/);
    assert.equal(existe("actions/form-name-actions.ts"), false);
    assert.doesNotMatch(acciones, /sheetsUrl: f\.sheetsUrl[\s\S]{0,200}getPublicFormBySlug/);
});

test("la pestaña de la hoja no se compara letra a letra", () => {
    const acciones = sinComentarios(leer("actions/forms-actions.ts"));
    const letraALetra = /properties\?\.title === (form\.title|formTitle)/.test(acciones);
    if (ROTO) {
        assert.equal(letraALetra, true, "ANTES: «PROCESO DE ATENCION» no encontraba «Proceso de atencion»");
        return;
    }
    assert.equal(letraALetra, false);
    assert.match(acciones, /laPestanaDelFormulario\(/);
});

test("borrar un campo pide confirmación, y la pantalla de registros cuenta con el servidor", () => {
    const editor = sinComentarios(leer(EDITOR));
    const registros = sinComentarios(leer(`${PANTALLA}/[formId]/registros/_components/FormRegistrosClient.tsx`));
    if (ROTO) {
        assert.doesNotMatch(editor, /AlertDialog/, "ANTES: la papelera de un campo borraba sin preguntar");
        assert.doesNotMatch(registros, /conteos/, "ANTES: los contadores eran el largo de lo cargado");
        return;
    }
    assert.match(editor, /Eliminar el campo/);
    assert.match(registros, /initialConteos/);
    assert.match(registros, /elResumenDelRegistro\(/);
});

test("el buscador y el filtro de la lista: sin tildes, y por estado", { skip: ROTO }, () => {
    const formularios = [
        { title: "Inscripción", slug: "inscripcion", publicSlug: null, description: "Alta de clientes", isActive: true },
        { title: "Encuesta", slug: "encuesta", publicSlug: "opinion", description: null, isActive: false },
        { title: "Proceso de atención", slug: "proceso", publicSlug: null, description: null, isActive: true },
    ];
    const titulos = (l) => l.map((f) => f.title);
    assert.deepEqual(titulos(r.losFormulariosQueSeVen(formularios, "inscripcion")), ["Inscripción"], "sin tildes");
    assert.deepEqual(titulos(r.losFormulariosQueSeVen(formularios, "ATENCION")), ["Proceso de atención"], "sin mayúsculas");
    assert.deepEqual(titulos(r.losFormulariosQueSeVen(formularios, "opinion")), ["Encuesta"], "por el enlace personalizado");
    assert.deepEqual(titulos(r.losFormulariosQueSeVen(formularios, "clientes")), ["Inscripción"], "por la descripción");
    assert.deepEqual(titulos(r.losFormulariosQueSeVen(formularios, "", "activos")), ["Inscripción", "Proceso de atención"]);
    assert.deepEqual(titulos(r.losFormulariosQueSeVen(formularios, "", "inactivos")), ["Encuesta"]);
    assert.deepEqual(titulos(r.losFormulariosQueSeVen(formularios, "encuesta", "activos")), [], "el filtro y el buscador se suman");
    assert.equal(r.comoFiltroDeSincronizacion("ERROR"), "ERROR");
    assert.equal(r.comoFiltroDeSincronizacion("SYNCED"), "SYNCED");
    assert.equal(r.comoFiltroDeSincronizacion("inventado"), "todos", "lo que no se entiende es «todos»");
    assert.equal(r.comoFiltroDeSincronizacion(undefined), "todos");
});

test("simetría: una cifra de arriba FILTRA su lista, y la que no filtra no se pinta", () => {
    const lista = sinComentarios(leer(`${PANTALLA}/_components/MisFormulariosClient.tsx`));
    const editor = sinComentarios(leer(EDITOR));
    const registros = sinComentarios(leer(`${PANTALLA}/[formId]/registros/_components/FormRegistrosClient.tsx`));
    const filtran = (src) => (src.match(/alPulsar:/g) ?? []).length;
    if (ROTO) {
        assert.equal(filtran(lista), 0, "ANTES: las cifras de la lista no filtraban nada");
        assert.equal(filtran(registros), 0, "ANTES: las de Registros tampoco");
        assert.match(editor, /PastillasDeMetricas/, "ANTES: el editor pintaba cifras que no filtraban");
        return;
    }
    assert.equal(filtran(lista), 3, "Todos, Activos e Inactivos filtran la lista");
    assert.equal(filtran(registros), 4, "Todos, Sincronizados, Pendientes y Con error filtran los registros");
    assert.match(lista, /enElTelefono/, "y se ven en el teléfono: son el filtro");
    assert.match(registros, /enElTelefono/);
    assert.doesNotMatch(editor, /PastillasDeMetricas/, "el editor no tiene cifras que filtren nada");
    assert.match(editor, /Ver registros \(/, "el número de registros va en su entrada del ⋯");
    assert.match(registros, /getFormSubmissions\(form\.id, filtro\)/, "el filtro se pide al servidor, no se aplica a lo cargado");
});
