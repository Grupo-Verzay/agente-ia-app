/**
 * El banco de la GUÍA PÚBLICA de Usuarios (`/guia/usuarios`).
 *
 * Las mismas cuatro cosas que la guía de Mis notas, y por el mismo motivo —se
 * rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** La barra de trabajo, los modos
 *    de reparto, las columnas de la tabla, los roles, los campos de «Nuevo
 *    asesor», el «⋯» de cada fila, el «⋯» de la barra y las tres gráficas que
 *    documenta `lib/guia-usuarios.ts` se leen de `team-client.tsx` y
 *    `TeamCharts.tsx`. Un mando nuevo sin su nombre en la guía pone esto en
 *    rojo, con el nombre del que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * `MODO=roto` lee los ficheros de `ANTES_USUARIOS_REF` —pinchado a un commit,
 * nunca `origin/main`— y afirma que no había guía de Usuarios.
 *
 * Se levanta con `scripts/banco-guia-usuarios.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_USUARIOS_REF ?? "ab6b110";

const EQUIPO = "app/(root)/equipo/_components/team-client.tsx";
const GRAFICAS = "app/(root)/equipo/_components/TeamCharts.tsx";

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

/** El trozo del marcado entre dos anclas, para no leer lo de otra ventana. */
const trozo = (t, desde, hasta) => {
    const i = t.indexOf(desde);
    if (i < 0) return "";
    const j = hasta ? t.indexOf(hasta, i + desde.length) : -1;
    return t.slice(i, j < 0 ? undefined : j);
};

if (ROTO) {
    test("ANTES no había guía pública de Usuarios", () => {
        assert.equal(leer("lib/guia-usuarios.ts"), "", "lib/guia-usuarios.ts ya existía en ANTES_USUARIOS_REF");
        assert.equal(leer("app/guia/usuarios/page.tsx"), "", "la página ya existía en ANTES_USUARIOS_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_USUARIOS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/["']usuarios["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía de Usuarios");
        assert.ok(!/guia\/usuarios/.test(leer("lib/tutoriales-del-modulo.ts")), "«Tutoriales del módulo» ya registraba la guía de Usuarios");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-usuarios/guia-usuarios.mjs"));
    const equipo = leer(EQUIPO);

    test("la barra de trabajo documentada es la de la pantalla, en su orden", () => {
        const barra = trozo(equipo, "<BarraDeAcciones", "{/* /fixed-top */}");
        assert.ok(barra, "no se encontró la barra de trabajo en team-client.tsx");
        let antes = -1;
        for (const p of guia.PARTES_DE_LA_BARRA_DE_TRABAJO) {
            const donde = barra.indexOf(p.marca);
            assert.ok(donde >= 0, `la barra ya no tiene «${p.nombre}» (${p.marca})`);
            assert.ok(donde > antes, `«${p.nombre}» no va en el orden que la guía dice`);
            antes = donde;
        }
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "barra.webp").texto;
        guia.PARTES_DE_LA_BARRA_DE_TRABAJO.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.nombre}`), `la barra no numera «${p.nombre}» como ${i + 1}`));
    });

    test("los modos de reparto son los de la pantalla, en su orden", () => {
        const modos = [...trozo(equipo, "const MODOS", "];").matchAll(/etiqueta: "([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual([...guia.MODOS_DE_REPARTO], modos);
        const texto = guia.laSeccion("auto-asignacion").pasos.map((p) => p.texto).join(" ");
        for (const m of guia.MODOS_DE_REPARTO) assert.ok(texto.includes(m), `la sección de auto-asignación no nombra «${m}»`);
    });

    test("las columnas de la tabla son las de la pantalla, en su orden", () => {
        const columnas = [...trozo(equipo, "<TableHeader>", "</TableHeader>").matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)].map((m) => m[1].trim());
        assert.deepEqual([...guia.COLUMNAS_DE_LA_TABLA], columnas);
        // La que solo sale con Por porcentaje va detrás de su condición.
        assert.match(trozo(equipo, "<TableHeader>", "</TableHeader>"), /modo === "porcentaje"[\s\S]*data-columna="porcentaje"/);
    });

    test("roles, campos de Nuevo asesor, el «⋯» de la fila y el de la barra son los de la pantalla", () => {
        const fila = trozo(equipo, "<TableHeader>", "{/* Gráficas */}");
        const roles = [...trozo(fila, '<SelectItem value="agente">', "</SelectContent>").matchAll(/<SelectItem value="\w+">([^<]+)</g)].map((m) => m[1]);
        assert.deepEqual([...guia.ROLES_DEL_EQUIPO], roles);

        const nuevo = trozo(equipo, "<DialogTitle>Nuevo asesor</DialogTitle>", "</Dialog>");
        const campos = [...nuevo.matchAll(/<Label htmlFor="adv-[^"]+">([^<]+)<\/Label>/g)].map((m) => m[1]);
        assert.deepEqual([...guia.CAMPOS_DEL_NUEVO_ASESOR], campos);

        const menu = trozo(fila, '<DropdownMenuContent align="end">', "</DropdownMenuContent>");
        const opciones = [...menu.matchAll(/\/>\s*\n\s*([^<{\n][^<{\n]*?)\s*\n\s*<\/DropdownMenuItem>/g)].map((m) => m[1].trim());
        assert.deepEqual([...guia.MENU_DEL_ASESOR], opciones);

        const mas = [...trozo(equipo, "<AccionesMasivas", "/>\n        }").matchAll(/etiqueta: "([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual([...guia.MAS_ACCIONES], mas);

        const graficas = [...leer(GRAFICAS).matchAll(/<CardTitle[^>]*>([^<]+)<\/CardTitle>/g)].map((m) => m[1]);
        assert.deepEqual([...guia.GRAFICAS_DEL_EQUIPO], graficas);

        // Y cada una de esas listas la nombra algún paso o consejo de la guía.
        // Menos «Reiniciar vínculos», a propósito: solo lo ve el súper
        // administrador de la plataforma, y esta guía es para clientes, que no
        // lo van a ver nunca. Nombrarlo sería prometer un mando que no tienen.
        const soloDeLaPlataforma = new Set(["Reiniciar vínculos"]);
        const todo = guia.SECCIONES.flatMap((s) => [...s.pasos.map((p) => `${p.titulo} ${p.texto}`), ...(s.consejos ?? [])]).join(" \n ");
        for (const x of [...guia.ROLES_DEL_EQUIPO, ...guia.MENU_DEL_ASESOR, ...guia.MAS_ACCIONES, ...guia.GRAFICAS_DEL_EQUIPO].filter((x) => !soloDeLaPlataforma.has(x))) {
            assert.ok(todo.includes(x), `ningún paso ni consejo de la guía nombra «${x}»`);
        }
    });

    test("la vista general numera las cinco zonas, y Usuarios está en su módulo del menú", () => {
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "vista-general.webp").texto;
        guia.ZONAS_DE_LA_PANTALLA.forEach((z, i) => assert.ok(texto.includes(`${i + 1} ${z}`), `la vista general no numera «${z}» como ${i + 1}`));
        const menu = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "menu-lateral.webp").texto;
        assert.ok(menu.includes(`dentro de ${guia.MODULO_DE_USUARIOS}`), "el paso del menú no dice en qué módulo vive Usuarios");
    });

    test("la guía cubre todos los apartados de la pantalla, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, [
            "vista-general",
            "crear-usuario",
            "rol-y-disponibilidad",
            "auto-asignacion",
            "por-porcentaje",
            "medir-al-equipo",
            "pipeline",
            "que-ve-cada-usuario",
            "editar-y-quitar",
            "asignar-y-mas",
        ]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/usuarios/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("asignar-y-mas").siguiente, null);
        assert.equal(guia.lasVecinas("rol-y-disponibilidad").anterior.slug, "crear-usuario");
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"usuarios"/);
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
        const dir = path.join(RAIZ, "public", "guia", "usuarios");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/usuarios/${n}`);
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
        for (const f of ["app/guia/usuarios/page.tsx", "app/guia/usuarios/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/usuarios/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deUsuarios = [["USUARIOS", "·"], ["Usuarios", "·"], ["usuarios", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/usuarios/${rel}`), deUsuarios),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/usuarios/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
