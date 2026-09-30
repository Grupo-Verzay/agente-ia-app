/**
 * El banco de la GUÍA PÚBLICA de Integrar URLs (`/guia/integraciones`).
 *
 * Las mismas cosas que la guía de Leads y la de Mis notas, y por el mismo
 * motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los mandos de una fila, los
 *    campos de la ventana, el orden de las pestañas en Chats y el «Más» que
 *    documenta `lib/guia-integraciones.ts` se leen de `MainIntegraciones.tsx`,
 *    `ChatHeader.tsx` y `PestanasDelChat.tsx`. Un botón nuevo en la fila sin su
 *    nombre en la guía pone esto en rojo, con el nombre del que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 * 5. **Su tarjeta sale sola en «Tutoriales del módulo»** de `/integraciones`,
 *    con el título y la descripción pedidos, y la semilla de las capturas dice
 *    lo mismo.
 *
 * `MODO=roto` lee los ficheros de `ANTES_INTEGRACIONES_REF` —pinchado a un
 * commit, nunca `origin/main`— y afirma que no había guía de Integrar URLs ni
 * marcas en la pantalla con las que una receta pudiera señalar sus partes.
 *
 * Se levanta con `scripts/banco-guia-integraciones.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_INTEGRACIONES_REF ?? "ab6b110";

const PANTALLA = "app/(root)/integraciones/_components/MainIntegraciones.tsx";
const CABECERA_DEL_CHAT = "app/(root)/chats/_components/ChatHeader.tsx";
const PESTANAS_DEL_CHAT = "app/(root)/chats/_components/PestanasDelChat.tsx";

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

/**
 * Los mandos de UNA fila tal cual los pinta la pantalla: los `title` de su
 * trozo, en su orden. El nombre y la dirección llevan un `title` DINÁMICO
 * (`{item.name}`) y no cuentan: son texto, no mandos. Del asa —con un `title`
 * que cambia si hay búsqueda— cuenta la primera rama, la de la lista sin
 * filtrar.
 */
export function losMandosDeLaFila(fuente) {
    const ini = fuente.indexOf("function FilaDeIntegracion");
    const fin = fuente.indexOf("// ── La pantalla", ini);
    if (ini < 0 || fin < 0) return [];
    const trozo = fuente.slice(ini, fin);
    return [...trozo.matchAll(/title=(?:"([^"]+)"|\{[^}?]*\?\s*'([^']+)'\s*:\s*'[^']+'\s*\})/g)].map((m) => m[1] ?? m[2]);
}

/** Los rótulos de los campos de la ventana de crear y editar, en su orden. */
export function losCamposDeLaVentana(fuente) {
    const ini = fuente.indexOf("function VentanaDeIntegracion");
    const fin = fuente.indexOf("// ── Una fila", ini);
    if (ini < 0 || fin < 0) return [];
    return [...fuente.slice(ini, fin).matchAll(/<Label htmlFor="[^"]+">([^<]+)<\/Label>/g)].map((m) => m[1].trim());
}

if (ROTO) {
    test("ANTES no había guía pública de Integrar URLs", () => {
        assert.equal(leer("lib/guia-integraciones.ts"), "", "lib/guia-integraciones.ts ya existía en ANTES_INTEGRACIONES_REF");
        assert.equal(leer("app/guia/integraciones/page.tsx"), "", "la página ya existía en ANTES_INTEGRACIONES_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_INTEGRACIONES_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/["']integraciones["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/"\/integraciones"/.test(leer("lib/tutoriales-del-modulo.ts")), "«Tutoriales del módulo» ya ofrecía la guía");
    });

    test("ANTES la pantalla no exponía nada con lo que una receta la pudiera señalar", () => {
        const pantalla = leer(PANTALLA);
        assert.ok(pantalla.length > 0, `ANTES_INTEGRACIONES_REF (${ANTES}) no tiene la pantalla`);
        for (const marca of ["data-fila-de-integracion", "data-ventana-de-integracion", "data-lista-de-integraciones", "data-pie-de-integraciones"]) {
            assert.ok(!pantalla.includes(marca), `la pantalla ya tenía «${marca}»`);
        }
        // Y la ventana de la guía —crear y editar en la misma, con sus dos
        // campos— no existía: se editaba en línea, en dos columnas.
        assert.deepEqual(losCamposDeLaVentana(pantalla), []);
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-integraciones/guia-integraciones.mjs"));
    const pantalla = leer(PANTALLA);

    test("los mandos de una fila documentados son EXACTAMENTE los de la pantalla, en su orden", () => {
        const enLaPantalla = losMandosDeLaFila(pantalla);
        assert.ok(enLaPantalla.length >= 4, `no se leyeron los mandos de la fila: ${JSON.stringify(enLaPantalla)}`);
        assert.deepEqual(
            guia.MANDOS_DE_LA_FILA.map((m) => m.titulo),
            enLaPantalla,
            "la guía y la fila no nombran los mismos mandos, en el mismo orden",
        );
        // La captura de la fila los numera: el 2 es el texto (nombre y
        // dirección), así que el asa es el 1 y los botones van del 3 al 5.
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "fila.webp").texto;
        const numeros = [1, 3, 4, 5];
        guia.MANDOS_DE_LA_FILA.forEach((m, i) => assert.ok(texto.includes(`${numeros[i]} ${m.nombre}`), `la fila no numera «${m.nombre}» como ${numeros[i]}`));
        assert.ok(texto.includes("2 El nombre y la dirección"), "la fila no numera el texto como 2");
    });

    test("los campos de la ventana son los de la pantalla, y la guía los nombra", () => {
        assert.deepEqual([...guia.CAMPOS_DE_LA_VENTANA], losCamposDeLaVentana(pantalla));
        const agregar = guia.laSeccion("agregar").pasos.map((p) => p.texto).join(" ");
        for (const c of guia.CAMPOS_DE_LA_VENTANA) assert.ok(agregar.toLowerCase().includes(c.toLowerCase()), `«Agregar una app» no nombra el campo «${c}»`);
        // Los rótulos de los botones que la guía cita existen en la pantalla.
        for (const boton of ["Nuevo", "Agregar", "Guardar", "Cancelar"]) {
            assert.match(pantalla, new RegExp(`['>]\\s*${boton}\\s*['<]`), `la pantalla ya no tiene «${boton}»`);
        }
        assert.match(pantalla, /'Editar app' : 'Nueva app'/, "la ventana ya no se titula «Nueva app» / «Editar app»");
    });

    test("en Chats: las apps van DETRÁS de Mensajes y Notas, en el orden de la lista, y lo que no cabe va a «Más»", () => {
        const cabecera = leer(CABECERA_DEL_CHAT);
        const i = cabecera.indexOf("const pestanasDelChat");
        assert.ok(i > 0, "ChatHeader ya no arma sus pestañas en `pestanasDelChat`");
        const trozo = cabecera.slice(i, cabecera.indexOf("];", i));
        const orden = ["'Mensajes'", "'Notas'", "userIntegrations.map"].map((x) => trozo.indexOf(x));
        assert.ok(orden.every((n) => n >= 0), `faltan pestañas: ${JSON.stringify(orden)}`);
        assert.deepEqual([...orden].sort((a, b) => a - b), orden, "las apps ya no van detrás de Mensajes y Notas");
        assert.match(leer(PESTANAS_DEL_CHAT), /'Más'/, "las pestañas que no caben ya no van a «Más»");
        // Y la guía lo cuenta así.
        const todo = guia.laSeccion("en-los-chats");
        assert.ok(todo.pasos[0].texto.includes("detrás de Mensajes y Notas"));
        assert.ok(todo.consejos.some((c) => c.includes("«Más»")));
        assert.ok(guia.laSeccion("ordenar-y-buscar").consejos.some((c) => c.includes("orden de las pestañas")));
    });

    test("lo que la guía promete del buscador, del pie y de borrar, la pantalla lo hace", () => {
        // «por nombre o por dirección»: el filtro mira los dos.
        assert.match(pantalla, /`\$\{i\.name\} \$\{i\.url\}`/, "el buscador ya no mira nombre y dirección");
        assert.ok(guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "barra.webp").texto.includes("por nombre o por dirección"));
        // «Buscando no se ordena» y el pie que lo dice.
        assert.match(pantalla, /sePuedeArrastrar=\{!buscando\}/);
        assert.match(pantalla, /borra la búsqueda para reordenar/);
        // «Confirma»: borrar pide confirmación, con «Cancelar».
        assert.match(pantalla, /<AlertDialogTitle>Eliminar «/);
        assert.match(pantalla, /<AlertDialogCancel>Cancelar<\/AlertDialogCancel>/);
        // «su fila lo avisa en amarillo»
        assert.match(pantalla, /data-aviso-de-la-fila/);
        assert.match(pantalla, /text-amber-600/);
    });

    test("la guía cubre todos los apartados de la pantalla, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "agregar", "en-los-chats", "abrir-y-editar", "ordenar-y-buscar", "eliminar", "cuando-no-abre"]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/integraciones/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("cuando-no-abre").siguiente, null);
        assert.equal(guia.lasVecinas("en-los-chats").anterior.slug, "agregar");
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"integraciones"/);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /integraciones: "Integrar URLs"/);
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
        const dir = path.join(RAIZ, "public", "guia", "integraciones");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/integraciones/${n}`);
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
        for (const f of ["app/guia/integraciones/page.tsx", "app/guia/integraciones/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/integraciones/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deIntegraciones = [["INTEGRACIONES", "·"], ["Integrar URLs", "·"], ["Integraciones", "·"], ["integraciones", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/integraciones/${rel}`), deIntegraciones),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/integraciones/${rel} no es la de Leads con otro nombre`,
            );
        }
    });

    test("su tarjeta sale sola en «Tutoriales del módulo», con el título y la descripción pedidos", async () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const i = t.indexOf('modulo: "integraciones"');
        assert.ok(i > 0, "GUIAS_PUBLICADAS no tiene la fila de integraciones");
        const fila = t.slice(i, t.indexOf("}", i));
        assert.match(fila, /ruta: "\/integraciones"/);
        assert.match(fila, /contenido: GUIA_INTEGRACIONES/);
        const tarjeta = /tarjeta: "([^"]+)"/.exec(fila)?.[1];
        assert.equal(tarjeta, "Aprende a abrir tus apps web dentro de tus chats en la plataforma");
        assert.ok(tarjeta.length <= 75, `la descripción tiene ${tarjeta.length} caracteres`);
        assert.ok(!/[[\]]/.test(tarjeta), "la descripción lleva corchetes literales");
        assert.equal(`Guía de ${guia.GUIA_INTEGRACIONES.titulo}`, "Guía de Integrar URLs");
        // La semilla de las capturas pinta la MISMA tarjeta en la barra de arriba.
        const semilla = leer("scripts/sembrar-guia-integraciones.mjs");
        assert.ok(semilla.includes(`description: "${tarjeta}"`), "la semilla usa otra descripción que la tarjeta");
        assert.ok(semilla.includes('title: "Guía de Integrar URLs"'), "la semilla usa otro título");
    });
}
