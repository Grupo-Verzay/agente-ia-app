/**
 * El banco de la GUÍA PÚBLICA de Catálogo (`/guia/catalogo`), y de lo que
 * hubo que arreglar en la pantalla para poder documentarla.
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los cinco apartados de la
 *    configuración y los campos de cada uno, en su orden, se leen de
 *    `CatalogoPanel.tsx` y se comparan con `APARTADOS_DOCUMENTADOS`. Un
 *    apartado o un campo nuevo en la pantalla sin su sitio en la guía pone
 *    esto en rojo, con el nombre del que falta.
 * 2. **Cada imagen que la guía enseña existe**, no hay huérfanas, y el vídeo
 *    está.
 * 3. **Es pública y no se indexa**, igual que la de Leads.
 * 4. **El catálogo público es público de verdad.** `/catalogo/<cuenta>` y
 *    `/c/<nombre>` no estaban en el middleware: a quien no tenía sesión —o
 *    sea, a cualquier cliente— lo mandaba al login.
 * 5. **El enlace personalizado se escribe como el nombre del negocio.** Antes
 *    cada tilde pasaba a guion («Café» → «caf-»), y el pie enseñaba un dominio
 *    escrito a mano mientras «URL activa» leía el de la página.
 *
 * `MODO=roto` lee los ficheros de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía, que el catálogo público pedía
 * sesión, y que el enlace se escribía y se enseñaba mal.
 *
 * Se levanta con `scripts/banco-guia-catalogo.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "24ba0b2";
const PANEL = "app/(root)/(protected)/panel/catalogo/_components/CatalogoPanel.tsx";

const leer = (rel) =>
    ROTO
        ? (() => {
              try {
                  return execSync(`git show ${ANTES}:"${rel}"`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
              } catch {
                  return "";
              }
          })()
        : readFileSync(path.join(RAIZ, rel), "utf8");

/**
 * Los apartados de la configuración tal como los pinta `CatalogoPanel.tsx`:
 * su clave, su título y los rótulos de sus campos, en orden. Se lee del
 * marcado, no de una lista escrita en el banco.
 */
export function losApartadosDelPanel(fuente) {
    const trozos = fuente.split(/<div data-seccion-del-catalogo="/).slice(1);
    return trozos.map((t) => {
        const clave = t.slice(0, t.indexOf('"'));
        const titulo = (/uppercase[^>]*>([^<]+)<\/p>/.exec(t)?.[1] ?? "").trim();
        const limpio = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        let campos = [...t.matchAll(/<Label[^>]*>([\s\S]*?)<\/Label>/g)].map((m) => limpio(m[1].replace(/<svg[\s\S]*?<\/svg>/g, "")));
        // Los interruptores no llevan <Label>: su rótulo es el texto en negrita de la fila.
        if (!campos.length) campos = [...t.matchAll(/text-sm font-medium">([^<]+)</g)].map((m) => m[1].trim());
        return { clave, titulo, campos };
    });
}

if (ROTO) {
    test("ANTES no había guía pública de Catálogo", () => {
        assert.equal(leer("lib/guia-catalogo.ts"), "", "lib/guia-catalogo.ts ya existía en ANTES_REF");
        assert.equal(leer("app/guia/catalogo/page.tsx"), "", "la página ya existía en ANTES_REF");
        assert.ok(!/"catalogo"/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción ya conocía la guía de Catálogo");
    });

    test("ANTES el catálogo público pedía sesión: el middleware no lo dejaba pasar", () => {
        const mw = leer("middleware.ts");
        assert.ok(mw.includes('currentPath.startsWith("/guia/")'), `middleware.ts de ${ANTES} no parece el de antes`);
        assert.ok(!mw.includes('startsWith("/catalogo/")'), "el middleware ya dejaba pasar /catalogo/");
        assert.ok(!mw.includes('startsWith("/c/")'), "el middleware ya dejaba pasar /c/");
    });

    test("ANTES cada tilde del enlace pasaba a guion y el pie llevaba el dominio escrito a mano", () => {
        const panel = leer(PANEL);
        const regla = /setSlugInput\(e\.target\.value\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9-\]\/g, '-'\)\)/;
        assert.match(panel, regla, "la regla vieja del enlace no está donde estaba");
        // Esa regla, aplicada: «Café del Monte» salía «caf--del-monte».
        const vieja = (t) => t.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        assert.equal(vieja("Café del Monte"), "caf--del-monte");
        assert.match(panel, /agente\.ia-app\.com\{publicUrl\}/, "el pie ya leía el dominio de la página");
        assert.equal(leer("lib/enlace-del-catalogo.ts"), "", "el enlace ya tenía su regla compartida");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-catalogo/guia-catalogo.mjs"));
    const enlace = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-catalogo/enlace-del-catalogo.mjs"));
    const panel = leer(PANEL);

    test("los apartados y campos documentados son EXACTAMENTE los de la pantalla", () => {
        const enLaPantalla = losApartadosDelPanel(panel);
        assert.equal(enLaPantalla.length, 5, `no se leyeron los cinco apartados: ${JSON.stringify(enLaPantalla)}`);
        assert.deepEqual(
            guia.APARTADOS_DOCUMENTADOS.map((a) => ({ titulo: a.apartado, campos: [...a.campos] })),
            enLaPantalla.map(({ titulo, campos }) => ({ titulo, campos })),
            "la guía y la pantalla no nombran los mismos apartados y campos, en el mismo orden",
        );
        // Cada apartado tiene su sección, y su primer paso dice dónde está.
        for (const a of guia.APARTADOS_DOCUMENTADOS) {
            const s = guia.laSeccion(a.seccion);
            assert.ok(s, `el apartado «${a.apartado}» no tiene su sección (${a.seccion})`);
            assert.ok(s.pasos[0].texto.includes(`En ${a.apartado}`), `el primer paso de «${s.titulo}» no dice «En ${a.apartado}»`);
        }
        // «Los cinco apartados» los numera en el orden de la pantalla.
        const apartados = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "apartados.webp");
        assert.ok(apartados.texto.includes("Datos básicos"), "el paso de los apartados no dice cuál está abierto al entrar");
        assert.match(panel, /basicos: true, identidad: false, textos: false,\s*redes: false, opciones: false/, "al entrar ya no está abierto solo Datos básicos");
    });

    test("la vista general numera las seis zonas en su orden", () => {
        const texto = guia.laSeccion("vista-general").pasos[0].texto;
        guia.ZONAS_DE_LA_PANTALLA.forEach((z, i) => assert.ok(texto.includes(`${i + 1} ${z}`), `«Todo en una pantalla» no numera «${z}» como ${i + 1}`));
        assert.equal(guia.ZONAS_DE_LA_PANTALLA.length, 6);
    });

    test("lo que la guía nombra de la pantalla existe en la pantalla", () => {
        for (const t of ["Ver catálogo", "URL personalizada", "URL activa", "Catálogo público", "Guardar", "/c/"]) {
            assert.ok(panel.includes(t), `la pantalla ya no dice «${t}»`);
        }
        const catalogo = leer("app/(public)/catalogo/[userId]/_components/CatalogoClient.tsx");
        for (const t of ["Buscar producto", "Todos", "Sin stock", "Consultar por WhatsApp", "unidades disponibles", "SKU:", "¡Últimas"]) {
            assert.ok(catalogo.includes(t), `el catálogo público ya no dice «${t}»`);
        }
        const textos = guia.SECCIONES.flatMap((s) => [...s.pasos.map((p) => p.texto), ...(s.consejos ?? [])]).join(" ");
        assert.ok(textos.includes("«Consultar por WhatsApp»"), "la guía no dice qué pone el botón sin texto propio");
        assert.ok(textos.includes("«Sin stock»") && textos.includes("«¡Últimas!»"), "la guía no nombra las marcas de stock de la tarjeta");
    });

    test("la guía cubre las ocho secciones, y cada una tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "ver-catalogo", "url-personalizada", "whatsapp", "identidad", "textos", "redes", "opciones"]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/catalogo/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("opciones").siguiente, null);
        assert.equal(guia.lasVecinas("whatsapp").anterior.slug, "url-personalizada");
        assert.equal(guia.CARPETA_DE_CAPTURAS, "/guia/catalogo");
        assert.equal(guia.MODULO_DE_CATALOGO, "Panel");
        assert.equal(guia.RUTA_DEL_CATALOGO, "/mis-catalogo");
    });

    test("cada paso es corto: la captura explica, el texto pone nombre", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            assert.ok(s.miniatura === `mini-${s.slug}.webp`, `${s.slug}: su miniatura no es la suya`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "catalogo");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        assert.ok(esperadas.includes("portada.webp"), "la portada del vídeo no está entre las capturas");
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/catalogo/${n}`);
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

    test("la guía es PÚBLICA y NO se indexa, como la de Leads", () => {
        const mw = leer("middleware.ts");
        assert.match(mw, /currentPath\.startsWith\("\/guia\/"\)/, "el middleware no deja pasar /guia/ sin sesión");
        for (const f of ["app/guia/catalogo/page.tsx", "app/guia/catalogo/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
            assert.ok(t.includes("@/lib/guia-catalogo"), `${f} no sale del contenido de la guía de Catálogo`);
            assert.ok(t.includes('modulo="Catálogo"'), `${f}: la barra de arriba no dice el módulo`);
        }
        const indice = leer("app/guia/catalogo/page.tsx");
        // El índice lee lo MISMO que el de Leads, y nada más.
        const lecturas = [...indice.matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
        assert.match(indice, /laIntroduccionPublica\("catalogo"/, "la introducción que se lee no es la de Catálogo");
        // Y las dos guías montan la MISMA página: las mismas piezas en el mismo orden.
        const piezas = (t) => [...t.matchAll(/<([A-Z][A-Za-z]+)[\s/>]/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i);
        assert.deepEqual(piezas(indice), piezas(leer("app/guia/leads/page.tsx")), "el índice de Catálogo no monta las mismas piezas que el de Leads");
        assert.deepEqual(piezas(leer("app/guia/catalogo/[seccion]/page.tsx")), piezas(leer("app/guia/leads/[seccion]/page.tsx")), "la página de sección no monta las mismas piezas que la de Leads");
    });

    test("el catálogo público no pide sesión: está en el middleware, y enseña solo lo publicado", () => {
        const mw = leer("middleware.ts");
        assert.ok(mw.includes('currentPath.startsWith("/catalogo/")'), "el middleware no deja pasar /catalogo/");
        assert.ok(mw.includes('currentPath.startsWith("/c/")'), "el middleware no deja pasar /c/");
        const acciones = leer("actions/products-actions.ts");
        const publico = acciones.slice(acciones.indexOf("export async function getPublicCatalog"));
        assert.match(publico.slice(0, 1500), /isActive:\s*true/, "el catálogo público tiene que enseñar solo los productos activos");
    });

    test("el enlace personalizado: una sola regla, en la pantalla y en el servidor", () => {
        assert.equal(enlace.comoSeEscribeElNombre("Café del Monte"), "cafe-del-monte");
        assert.equal(enlace.comoSeEscribeElNombre("Ñandú & Cía"), "nandu---cia");
        assert.equal(enlace.comoNombreDelEnlace("  --Café   del Monte-- "), "cafe-del-monte");
        assert.equal(enlace.comoNombreDelEnlace("¡¡!!"), "");
        assert.equal(enlace.laRutaDelCatalogo("cafe", "u1"), "/c/cafe");
        assert.equal(enlace.laRutaDelCatalogo("  ", "u1"), "/catalogo/u1");
        assert.equal(enlace.laRutaDelCatalogo(null, "u1"), "/catalogo/u1");
        assert.equal(enlace.elEnlaceQueSeEnsena("agente.ia-app.com/", "/c/cafe"), "agente.ia-app.com/c/cafe");
        // La pantalla escribe con la regla, y el servidor guarda con la misma.
        assert.match(panel, /setSlugInput\(comoSeEscribeElNombre\(e\.target\.value\)\)/);
        const accion = leer("actions/catalog-config-actions.ts");
        assert.match(accion, /comoNombreDelEnlace\(/, "el servidor no guarda con la misma regla");
        // Los dos enlaces de la pantalla dicen lo mismo: ninguno lleva el dominio a mano.
        assert.equal((panel.match(/elEnlaceQueSeEnsena\(dominio,/g) ?? []).length, 2, "«URL activa» y el pie no salen de la misma función");
        assert.ok(!panel.includes("agente.ia-app.com"), "la pantalla vuelve a llevar un dominio escrito a mano");
    });

    test("la pantalla lleva las marcas que usan las capturas", () => {
        for (const m of ["data-cabecera-del-catalogo", "data-url-personalizada", "data-configuracion-del-catalogo", "data-pie-del-catalogo"]) {
            assert.ok(panel.includes(m), `a la pantalla le falta ${m}`);
        }
        const guion = readFileSync(path.join(RAIZ, "scripts/capturar-guia-catalogo.mjs"), "utf8");
        for (const m of ["data-cabecera-del-catalogo", "data-url-personalizada", "data-configuracion-del-catalogo", "data-pie-del-catalogo", "data-seccion-del-catalogo"]) {
            assert.ok(guion.includes(m), `el guion de capturas ya no usa ${m}`);
        }
        // El dominio de las capturas: se reescribe el texto, nunca los enlaces.
        assert.match(guion, /conElDominioDeLaGuia\(ctx, BASE\)/);
    });
}
