/**
 * Mis notas (`/notas`): las REGLAS de la pantalla y un BARRIDO del código.
 *
 * Las reglas son puras (`lib/pantalla-de-notas.ts`) y se prueban sin nada
 * levantado. El barrido lee los componentes y exige que PASEN por ellas: una
 * regla correcta que la pantalla no usa no arregla nada.
 *
 * `MODO=roto` lee los mismos ficheros de `ANTES_REF` —pinchado a un commit,
 * nunca `origin/main`— y AFIRMA los fallos: la carpeta que se plegaba al
 * abrirla, el contador de palabras sobre el JSON, el «⋯» solo al pasar el
 * ratón, borrar de un clic, el buscador que solo miraba el título…
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF || "24ba0b2";

const DIR = "app/(root)/notas/_components";
const leer = (ruta) =>
    ROTO
        ? execFileSync("git", ["show", `${ANTES}:${ruta}`], { cwd: RAIZ, encoding: "utf8" })
        : readFileSync(join(RAIZ, ruta), "utf8");
/** El código sin comentarios: la explicación de un arreglo no puede tumbar su banco. */
const codigo = (ruta) => leer(ruta).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\s*\}/g, "{}");

if (ROTO) {
    test("ANTES: la primera pulsación en una carpeta la PLEGABA", () => {
        const s = codigo(`${DIR}/NotesSidebar.tsx`);
        assert.match(s, /onSelectFolder\(folder\.id\)\s*\n\s*setCollapsed\(p => \(\{ \.\.\.p, \[folder\.id\]: !p\[folder\.id\] \}\)\)/);
        // La regla vieja, literal: nace desplegada (collapsed = undefined) y el
        // primer clic la deja plegada, así que su lista no se pinta.
        const collapsed = {};
        collapsed.x = !collapsed.x;
        assert.equal(Boolean(!collapsed.x), false, "tras el primer clic la lista NO se ve");
    });
    test("ANTES: el contador de palabras contaba el JSON del editor", () => {
        const s = codigo(`${DIR}/NotesEditor.tsx`);
        assert.match(s, /JSON\.stringify\(content\)/);
        const countWords = (content) =>
            JSON.stringify(content).replace(/<[^>]*>/g, "").replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ\s]/g, " ").split(/\s+/).filter((w) => w.length > 1).length;
        const vacia = { type: "doc", content: [{ type: "paragraph" }] };
        assert.ok(countWords(vacia) > 0, `una nota vacía decía ${countWords(vacia)} palabras`);
        assert.match(s, /\{wordCount\} palabras/, "y «1 palabras»");
    });
    test("ANTES: el buscador del cuerpo no podía encontrar nada, y Archivo y Compartidas lo ignoraban", () => {
        const s = codigo("actions/notes-actions.ts");
        assert.match(s, /content: \{ path: \[\], string_contains: search \}/);
        assert.match(s, /export async function getArchivedNotes\(userId: string\)/);
        assert.match(s, /export async function getSharedNotes\(userId: string\)/);
        assert.match(s, /orderBy: \{ updatedAt: 'desc' \}/, "el Archivo solo por fecha");
    });
    test("ANTES: el «⋯» de una nota o carpeta solo salía al pasar el ratón", () => {
        for (const f of ["SortableNoteList.tsx", "SortableSharedNoteList.tsx", "NotesSidebar.tsx"]) {
            assert.match(codigo(`${DIR}/${f}`), /"invisible group-hover:visible /, f);
        }
    });
    test("ANTES: eliminar una nota desde la lista o una carpeta no pedía confirmación", () => {
        assert.match(codigo(`${DIR}/SortableNoteList.tsx`), /onClick=\{e => \{ e\.stopPropagation\(\); onDelete\(note\.id\) \}\}/);
        assert.match(codigo(`${DIR}/NotesSidebar.tsx`), /onClick=\{\(\) => onDeleteFolder\(folder\.id\)\}/);
    });
    test("ANTES: la ayuda del editor prometía un «/» que no existe, y «Templates» en inglés", () => {
        assert.match(codigo("components/shared/EditorDeTexto.tsx"), /usa \/ para insertar bloques/);
        assert.match(codigo(`${DIR}/NotesEditor.tsx`), /title="Templates"/);
    });
    test("ANTES: elegir un icono o un color NO cerraba su menú (eran botones sueltos dentro)", () => {
        const editor = codigo(`${DIR}/NotesEditor.tsx`);
        assert.match(editor, /<button key=\{e\}[\s\S]*?onClick=\{\(\) => onEmojiChange\(/);
        assert.match(editor, /<button key=\{String\(c\.value\)\}[\s\S]*?onClick=\{\(\) => onColorChange\(/);
    });
    test("ANTES: salir del título guardaba la nota aunque no hubiera cambiado nada", () => {
        const editor = codigo(`${DIR}/NotesEditor.tsx`);
        assert.match(editor, /handleTitleBlur = useCallback\(\(\) => \{ if \(canEdit\) onSave\(/);
    });
    test("ANTES: las pestañas del panel llevaban icono y abreviaban: no cabían («Suelt…», «Co…»)", () => {
        const barra = codigo(`${DIR}/NotesSidebar.tsx`);
        assert.match(barra, /<FileX className/);
        assert.match(barra, /<span className="truncate">Compart\.<\/span>/);
        assert.match(barra, /TabsTrigger value="sin"[^>]*className="flex-1 /);
    });
    test("ANTES: «Vincular contacto» pedía los contactos de la PERSONA", () => {
        assert.match(codigo(`${DIR}/NoteContactPicker.tsx`), /\?userId=\$\{userId\}/);
        assert.match(codigo("app/api/notes/contacts/route.ts"), /where: \{\s*userId,/);
    });
} else {
    const r = await import(join(AQUI, ".compilado", "pantalla-de-notas", "pantalla-de-notas.js"));

    test("pulsar una carpeta la ABRE desplegada; pulsar la abierta la pliega o despliega", () => {
        assert.deepEqual(r.alPulsarUnaCarpeta({ esLaActiva: false, estaPlegada: false }), { seleccionar: true, plegada: false });
        // Una que se plegó y luego se dejó: al volver a ella se abre desplegada.
        assert.deepEqual(r.alPulsarUnaCarpeta({ esLaActiva: false, estaPlegada: true }), { seleccionar: true, plegada: false });
        assert.deepEqual(r.alPulsarUnaCarpeta({ esLaActiva: true, estaPlegada: false }), { seleccionar: false, plegada: true });
        assert.deepEqual(r.alPulsarUnaCarpeta({ esLaActiva: true, estaPlegada: true }), { seleccionar: false, plegada: false });
    });

    test("las vistas del panel", () => {
        assert.equal(r.laVista(undefined), "todas");
        assert.equal(r.laVista(null), "sueltas");
        assert.equal(r.laVista(r.COMPARTIDAS), "compartidas");
        assert.equal(r.laVista(r.ARCHIVO), "archivo");
        assert.equal(r.laVista("carpeta-1"), "carpeta");
    });

    test("el buscador: sin tildes ni mayúsculas, y lo que se teclea se escapa", () => {
        assert.equal(r.LETRAS_CON_TILDE.length, r.LETRAS_SIN_TILDE.length, "la lista de tildes está pareada");
        assert.equal(r.elPatronDeBusqueda("  "), null);
        assert.equal(r.elPatronDeBusqueda(undefined), null);
        assert.equal(r.elPatronDeBusqueda("Café"), "%cafe%");
        assert.equal(r.elPatronDeBusqueda("ÑANDÚ"), "%nandu%");
        assert.equal(r.elPatronDeBusqueda("50%"), "%50\\%%");
        assert.equal(r.elPatronDeBusqueda("a_b"), "%a\\_b%");
        assert.equal(r.elPatronDeBusqueda("c:\\x"), "%c:\\\\x%");
        // Cada letra con tilde tiene su pareja: ninguna se queda igual.
        for (const c of r.LETRAS_CON_TILDE) assert.notEqual(r.sinTildes(c), c, c);
    });

    test("las palabras son las ESCRITAS, y «1 palabra» en singular", () => {
        assert.equal(r.contarPalabras(""), 0);
        assert.equal(r.contarPalabras("  Llamar al\n proveedor  "), 3);
        assert.equal(r.elRotuloDePalabras(0), "0 palabras");
        assert.equal(r.elRotuloDePalabras(1), "1 palabra");
        assert.equal(r.elRotuloDePalabras(7), "7 palabras");
    });

    test("una lista vacía dice POR QUÉ, y buscando dice qué se buscó", () => {
        const vistas = ["todas", "sueltas", "carpeta", "archivo", "compartidas"];
        const mensajes = vistas.map((vista) => r.elMensajeDeLaListaVacia({ vista }));
        assert.equal(new Set(mensajes).size, vistas.length, "cada vista su mensaje");
        for (const vista of vistas) {
            assert.equal(r.elMensajeDeLaListaVacia({ vista, busqueda: " cafe " }), "Ninguna nota coincide con «cafe».");
        }
    });

    test("con una búsqueda puesta no se reordena", () => {
        assert.equal(r.sePuedeReordenar(""), true);
        assert.equal(r.sePuedeReordenar(null), true);
        assert.equal(r.sePuedeReordenar("x"), false);
    });

    test("el nombre de un contacto: el puesto a mano manda", () => {
        assert.equal(r.nombreDelContacto({ customName: "Doña Ana", pushName: "Ana" }), "Doña Ana");
        assert.equal(r.nombreDelContacto({ customName: " ", pushName: "Ana" }), "Ana");
        assert.equal(r.nombreDelContacto({}), "Sin nombre");
    });

    test("el «⋯» sale también con el teclado y en una pantalla táctil", () => {
        assert.match(r.MANDO_QUE_APARECE_AL_PASAR, /group-hover:visible/);
        assert.match(r.MANDO_QUE_APARECE_AL_PASAR, /group-focus-within:visible/);
        assert.match(r.MANDO_QUE_APARECE_AL_PASAR, /\[@media\(hover:none\)\]:visible/);
    });

    test("BARRIDO: la pantalla pasa por las reglas", () => {
        const barra = codigo(`${DIR}/NotesSidebar.tsx`);
        assert.match(barra, /alPulsarUnaCarpeta\(/);
        assert.match(barra, /setCarpetaABorrar\(folder\)/, "borrar una carpeta pasa por su confirmación");
        assert.doesNotMatch(barra, /function NoteList\(/, "sin la lista muerta");
        assert.match(barra, /<span className="truncate">Compartidas<\/span>\s*\{sharedTotal > 0/, "el número va DESPUÉS del rótulo");
        for (const f of ["SortableNoteList.tsx", "SortableSharedNoteList.tsx", "NotesSidebar.tsx"]) {
            const s = codigo(`${DIR}/${f}`);
            assert.doesNotMatch(s, /"invisible group-hover:visible/, `${f}: el «⋯» no va escrito a mano`);
            assert.match(s, /MANDO_QUE_APARECE_AL_PASAR/, f);
        }
        const lista = codigo(`${DIR}/SortableNoteList.tsx`);
        assert.doesNotMatch(lista, /Sin notas aquí/);
        const editor = codigo(`${DIR}/NotesEditor.tsx`);
        assert.doesNotMatch(editor, /JSON\.stringify\(content\)/);
        assert.match(editor, /cuerpoComoTexto\(content, false\)/);
        assert.match(editor, /elRotuloDePalabras\(wordCount\)/);
        assert.doesNotMatch(editor, /AlertDialog/, "la confirmación de eliminar es UNA, en NotesClient");
        assert.doesNotMatch(editor, /Templates/);
        assert.match(editor, /placeholder=\{PLACEHOLDER_DE_LA_NOTA\}/);
        assert.doesNotMatch(codigo("components/shared/EditorDeTexto.tsx"), /\/ para insertar/);
        const cliente = codigo(`${DIR}/NotesClient.tsx`);
        assert.match(cliente, /getArchivedNotes\(userId, q\)/);
        assert.match(cliente, /getSharedNotes\(userId, q\)/);
        assert.match(cliente, /data-confirmar-eliminar-nota/);
        const acciones = codigo("actions/notes-actions.ts");
        assert.doesNotMatch(acciones, /string_contains/);
        assert.match(acciones, /jsonb_path_query_array/);
        assert.match(acciones, /notes: \{ where: \{ isArchived: false \} \}/, "el número de una carpeta no cuenta las archivadas");
        assert.doesNotMatch(codigo(`${DIR}/NoteContactPicker.tsx`), /userId=/);
        // Icono y color: cada opción es un ELEMENTO del menú, que lo cierra al
        // elegir; un botón suelto dentro lo dejaba abierto encima de la nota.
        assert.match(editor, /<DropdownMenuItem key=\{e\}[\s\S]*?onSelect=\{\(\) => onEmojiChange\(/);
        assert.match(editor, /<DropdownMenuItem key=\{String\(c\.value\)\}[\s\S]*?onSelect=\{\(\) => onColorChange\(/);
        assert.doesNotMatch(editor, /onClick=\{\(\) => on(Emoji|Color)Change\(/);
        // Salir del título solo guarda si el título cambió.
        assert.match(editor, /handleTitleBlur = useCallback\(\(\) => \{ if \(canEdit && title !== note\.title\) onSave\(/);
        // Las pestañas: la palabra entera y sin icono, cada una del ancho de lo que dice.
        const pestanas = barra.slice(barra.indexOf("<TabsList"), barra.indexOf("</TabsList>"));
        assert.equal((pestanas.match(/<TabsTrigger /g) ?? []).length, 4);
        assert.doesNotMatch(pestanas, /<[A-Z][A-Za-z]+ className="h-3 w-3/, "una pestaña vuelve a llevar icono: no caben las cuatro");
        assert.doesNotMatch(pestanas, /\bflex-1\b/, "las pestañas se reparten a partes iguales: la larga se corta");
        assert.doesNotMatch(pestanas, /Compart\./);
        const ruta = codigo("app/api/notes/contacts/route.ts");
        assert.match(ruta, /laCuentaActiva\(user\)/);
        assert.doesNotMatch(ruta, /searchParams\.get\('userId'\)/, "el id no llega del navegador");
    });
}
