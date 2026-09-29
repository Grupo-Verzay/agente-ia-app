/**
 * DESARCHIVAR una nota de Mis notas: la regla y un barrido del código.
 *
 * El fallo: archivar vivía en la barra del editor y la acción para deshacerlo
 * (`unarchiveNote`) existía, importada en `NotesClient`, pero NO LA LLAMABA
 * NADIE. Una nota archivada no tenía ninguna forma de volver a la lista activa.
 *
 * `MODO=roto` lee la barra y la pantalla de `ANTES_REF` con `git show` y AFIRMA
 * el fallo: `unarchiveNote` importada y nunca llamada, y un solo botón que dice
 * «Archivar nota» pase lo que pase.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF ?? "16e81b7";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const EDITOR = "app/(root)/notas/_components/NotesEditor.tsx";
const CLIENTE = "app/(root)/notas/_components/NotesClient.tsx";

function leer(ruta) {
    return ROTO
        ? execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], { cwd: RAIZ, encoding: "utf8" })
        : fs.readFileSync(join(RAIZ, ruta), "utf8");
}
/** Sin comentarios: la explicación del arreglo no puede tumbar ni aprobar el barrido. */
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const editor = sinComentarios(leer(EDITOR));
const cliente = sinComentarios(leer(CLIENTE));
/** Llamadas de verdad, no el nombre en el `import`. */
const llamadasA = (s, nombre) => (s.match(new RegExp(`\\b${nombre}\\s*\\(`, "g")) ?? []).length;

if (ROTO) {
    test("ANTES: unarchiveNote se importaba y no la llamaba nadie", () => {
        assert.match(cliente, /\bunarchiveNote\b/, "estaba importada");
        assert.equal(llamadasA(cliente, "unarchiveNote"), 0, "y ninguna llamada");
    });
    test("ANTES: la barra solo sabía archivar, estuviera como estuviera la nota", () => {
        assert.doesNotMatch(editor, /ArchiveRestore/);
        assert.doesNotMatch(editor, /isArchived/);
        assert.match(editor, /title="Archivar nota"/);
    });
} else {
    const { elMandoDeArchivo, sinLaNota } = await import(join(AQUI, ".compilado", "desarchivar-nota", "archivo-de-notas.js"));

    test("una nota activa ofrece ARCHIVAR, y queda archivada", () => {
        const m = elMandoDeArchivo(false);
        assert.equal(m.accion, "archivar");
        assert.equal(m.titulo, "Archivar nota");
        assert.equal(m.aviso, "Nota archivada");
        assert.equal(m.quedaArchivada, true);
    });

    test("una nota archivada ofrece DESARCHIVAR, y vuelve a activa", () => {
        const m = elMandoDeArchivo(true);
        assert.equal(m.accion, "desarchivar");
        assert.equal(m.titulo, "Desarchivar nota");
        assert.equal(m.aviso, "Nota desarchivada");
        assert.equal(m.quedaArchivada, false);
    });

    test("simetría: aplicar el mando dos veces vuelve al estado de partida", () => {
        for (const inicio of [true, false]) {
            const una = elMandoDeArchivo(inicio).quedaArchivada;
            assert.equal(una, !inicio);
            assert.equal(elMandoDeArchivo(una).quedaArchivada, inicio);
        }
    });

    test("lo que no se entiende cuenta como activa (se ofrece archivar, nunca un desarchivar falso)", () => {
        for (const raro of [null, undefined]) assert.equal(elMandoDeArchivo(raro).accion, "archivar");
    });

    test("las dos caras quitan la nota de la lista que se mira, y solo esa", () => {
        const lista = [{ id: "a" }, { id: "b" }, { id: "c" }];
        assert.deepEqual(sinLaNota(lista, "b").map((n) => n.id), ["a", "c"]);
        assert.equal(lista.length, 3, "no muta la de partida");
    });

    test("barrido: la pantalla LLAMA a unarchiveNote y a archiveNote, desde el mismo manejador", () => {
        assert.equal(llamadasA(cliente, "unarchiveNote"), 1);
        assert.equal(llamadasA(cliente, "archiveNote"), 1);
        const m = cliente.match(/handleToggleArchive = useCallback\(async[\s\S]*?\}, \[/);
        assert.ok(m, "hay un solo manejador");
        assert.match(m[0], /unarchiveNote\(/);
        assert.match(m[0], /archiveNote\(/);
        assert.match(m[0], /elMandoDeArchivo\(/, "decide con la regla, no con otra condición");
    });

    test("barrido: la barra usa UN botón que cambia de cara según note.isArchived", () => {
        assert.match(editor, /elMandoDeArchivo\(note\.isArchived\)/);
        assert.match(editor, /ArchiveRestore/);
        assert.equal((editor.match(/data-mando-archivo=/g) ?? []).length, 1, "un solo botón, en el mismo sitio");
        assert.doesNotMatch(editor, /title="Archivar nota"/, "el título sale de la regla");
    });
}
