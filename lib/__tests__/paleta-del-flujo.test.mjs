// La paleta del creador de flujos es una COLUMNA del contenido: se ancla a su
// contenedor y no a la ventana. Sin navegador: que la clase pise `fixed` y
// `h-svh` al pasar por tailwind-merge (que es lo que hace `cn`), y que la
// página ancle y la paleta la use. `MODO=roto` lee el código de ANTES_REF y
// AFIRMA que la paleta quedaba pegada a la ventana.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { twMerge } = require("tailwind-merge");
const ROTO = process.env.MODO === "roto";
const REF = process.env.ANTES_REF ?? "d76c6ff";
const leer = (ruta) => (ROTO ? execSync(`git show ${REF}:"${ruta}"`, { encoding: "utf8" }) : readFileSync(ruta, "utf8"));

const SIDEBAR = "app/(root)/workflow/[workflowId]/_components/WorkflowSidebar.tsx";
const PAGINA = "app/(root)/workflow/[workflowId]/page.tsx";
// Lo que el `Sidebar` de shadcn pone de base en su caja.
const BASE = "fixed inset-y-0 z-10 hidden h-svh w-[--sidebar-width] md:flex right-0";

function laClaseDeLaPaleta() {
    const s = leer(SIDEBAR);
    if (s.includes("className={PALETA_DEL_FLUJO}")) {
        return readFileSync("lib/paleta-del-flujo.ts", "utf8").match(/PALETA_DEL_FLUJO =\s*"([^"]+)"/)[1];
    }
    const m = s.match(/side="right"[\s\S]*?className="([^"]+)"/);
    return m ? m[1] : "";
}

test("la paleta queda anclada a su contenedor, no a la ventana", () => {
    const final = twMerge(BASE, laClaseDeLaPaleta()).split(/\s+/);
    if (ROTO) {
        assert.ok(final.includes("fixed") && final.includes("h-svh"), "antes: la paleta era fixed y de alto de ventana");
        return;
    }
    assert.ok(final.includes("absolute"), "la paleta tiene que ser absolute");
    assert.ok(!final.includes("fixed"), "no puede quedar fixed");
    assert.ok(final.includes("h-full") && !final.includes("h-svh"), "mide lo que su contenedor");
});

test("la página ancla la paleta y mide lo que la pantalla", () => {
    const s = leer(PAGINA);
    const m = s.match(/<SidebarProvider[\s\S]*?className="([^"]+)"/);
    const clases = (m?.[1] ?? "").split(/\s+/);
    if (ROTO) {
        assert.ok(!clases.includes("relative"), "antes: el contenedor no anclaba nada");
        return;
    }
    for (const c of ["relative", "h-full", "min-h-0"]) assert.ok(clases.includes(c), `falta ${c}`);
    // tailwind-merge: min-h-0 pisa el min-h-svh de base del proveedor.
    assert.ok(twMerge("flex min-h-svh w-full", m[1]).split(/\s+/).includes("min-h-0"));
});
