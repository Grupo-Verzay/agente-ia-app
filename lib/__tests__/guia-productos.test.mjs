/**
 * El banco de la GUÍA PÚBLICA de Productos (`/guia/productos`), y de lo que
 * hubo que arreglar en la pantalla para poder documentarla.
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las columnas de la tabla, las
 *    cifras de la barra y los campos del formulario se leen de los
 *    componentes y se comparan con lo que la guía documenta.
 * 2. **Cada imagen que la guía enseña existe**, no hay huérfanas, y el vídeo
 *    está.
 * 3. **Es pública y no se indexa**, y monta las mismas piezas que Leads.
 * 4. **Las reglas de la pantalla** (`lib/productos.ts`): un producto nuevo no
 *    nace agotado, «Sin stock» no cuenta los de inventario sin límite, el
 *    buscador mira nombre, código y categoría, y reordenar con un filtro
 *    puesto no pisa el sitio de lo escondido.
 *
 * `MODO=roto` lee los ficheros de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma los fallos.
 *
 * Se levanta con `scripts/banco-guia-productos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "7767f6f";
const FORM = "app/(root)/products/components/ProductForm.tsx";
const TABLA = "app/(root)/products/components/ProductTable.tsx";
const MAIN = "app/(root)/products/components/MainProducts.tsx";
const ACCIONES = "actions/products-actions.ts";

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

if (ROTO) {
    test("ANTES no había guía pública de Productos", () => {
        assert.equal(leer("lib/guia-productos.ts"), "", "lib/guia-productos.ts ya existía en ANTES_REF");
        assert.equal(leer("app/guia/productos/page.tsx"), "", "la página ya existía en ANTES_REF");
        assert.ok(!/"productos"/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción ya conocía la guía de Productos");
        assert.ok(!/guia-productos/.test(leer("lib/tutoriales-del-modulo.ts")), "Tutoriales ya conocía la guía de Productos");
    });

    test("ANTES un producto nuevo nacía agotado y «Sin stock» contaba los de inventario sin límite", () => {
        const form = leer(FORM);
        assert.match(form, /stock: product\?\.stock \?\? 0,/, "el formulario ya no reiniciaba el inventario a 0");
        const acciones = leer(ACCIONES);
        assert.match(acciones, /stock: \{ lte: 0 \}/, "«Sin stock» ya no contaba con lte 0");
        assert.equal(leer("lib/productos.ts"), "", "las reglas ya tenían su módulo");
    });

    test("ANTES el buscador solo miraba el nombre", () => {
        const acciones = leer(ACCIONES);
        assert.match(acciones, /\{ title: \{ contains: q, mode: Prisma\.QueryMode\.insensitive \} \}/);
        assert.ok(!/sku: \{ contains/.test(acciones), "ya buscaba por código");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-productos/guia-productos.mjs"));
    const reglas = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-productos/productos.mjs"));
    const form = leer(FORM);
    const tabla = leer(TABLA);
    const main = leer(MAIN);
    const acciones = leer(ACCIONES);

    test("las columnas de la tabla son EXACTAMENTE las de la pantalla", () => {
        const columnas = [...tabla.matchAll(/header: (?:"([^"]+)"|\(\) => <span[^>]*>([^<]+)<\/span>)/g)].map((m) => m[1] ?? m[2]);
        assert.deepEqual(columnas, [...guia.COLUMNAS_DE_LA_TABLA]);
    });

    test("las cifras de la barra son EXACTAMENTE las de la pantalla", () => {
        const cifras = [...main.matchAll(/etiqueta: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual(cifras, [...guia.CIFRAS_DE_LA_BARRA]);
    });

    test("los campos del formulario son EXACTAMENTE los de la pantalla, en su orden", () => {
        const campos = [...form.matchAll(/data-campo="([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(campos, [...guia.CAMPOS_DEL_PRODUCTO]);
    });

    test("la vista general numera las cuatro zonas en su orden", () => {
        const texto = guia.laSeccion("vista-general").pasos[0].texto;
        guia.ZONAS_DE_LA_PANTALLA.forEach((z, i) => assert.ok(texto.includes(`${i + 1} ${z}`), `no numera «${z}» como ${i + 1}`));
    });

    test("lo que la guía nombra de la pantalla existe en la pantalla", () => {
        for (const t of ["Nuevo producto", "Editar producto", "Precio antes", "Sin límite", "La primera es la imagen principal", "Este código ya está registrado.", "Agregar etiqueta"]) {
            assert.ok(form.includes(t), `el formulario ya no dice «${t}»`);
        }
        for (const t of ["Eliminar producto", "Cancelar", "Activo", "Inactivo"]) assert.ok(tabla.includes(t), `la tabla ya no dice «${t}»`);
        for (const t of ["Buscar producto...", "Ver catálogo"]) assert.ok(main.includes(t), `la barra ya no dice «${t}»`);
    });

    test("la guía cubre sus diez secciones, y cada una tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "buscar", "cifras", "ver-catalogo", "crear", "fotos", "precio", "categoria-y-codigo", "inventario", "editar-y-eliminar"]);
        const pagina = leer("app/guia/productos/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("editar-y-eliminar").siguiente, null);
        assert.equal(guia.CARPETA_DE_CAPTURAS, "/guia/productos");
        assert.equal(guia.MODULO_DE_PRODUCTOS, "Entrenamiento");
        assert.equal(guia.RUTA_DE_PRODUCTOS, "/products");
    });

    test("cada paso es corto y cada sección tiene al menos tres", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            assert.equal(s.miniatura, `mini-${s.slug}.webp`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "productos");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/productos/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5 && kb < 600, `${n} pesa ${kb.toFixed(1)} KB`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const mb = statSync(path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION)).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("la guía es PÚBLICA, NO se indexa y monta las mismas piezas que Leads", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/productos/page.tsx", "app/guia/productos/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
            assert.ok(t.includes("@/lib/guia-productos"), `${f} no sale del contenido de la guía de Productos`);
            assert.ok(t.includes('modulo="Productos"'), `${f}: la barra de arriba no dice el módulo`);
        }
        const indice = leer("app/guia/productos/page.tsx");
        assert.match(indice, /laIntroduccionPublica\("productos"/);
        const piezas = (t) => [...t.matchAll(/<([A-Z][A-Za-z]+)[\s/>]/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i);
        assert.deepEqual(piezas(indice), piezas(leer("app/guia/leads/page.tsx")));
        assert.deepEqual(piezas(leer("app/guia/productos/[seccion]/page.tsx")), piezas(leer("app/guia/leads/[seccion]/page.tsx")));
    });

    test("la tarjeta sale sola en «Tutoriales del módulo» de /products", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        assert.match(t, /ruta: "\/products"/);
        assert.ok(t.includes("Aprende a crear y organizar tus productos en la plataforma"));
    });

    test("un producto nuevo NO nace agotado: el inventario abre en «sin límite»", () => {
        assert.equal(reglas.elInventarioAlAbrir(undefined), reglas.SIN_LIMITE);
        assert.equal(reglas.elInventarioAlAbrir(null), reglas.SIN_LIMITE);
        assert.equal(reglas.elInventarioAlAbrir(7), 7);
        assert.equal(reglas.elInventarioAlAbrir(0), 0);
        assert.equal(reglas.elInventarioAlAbrir(-5), reglas.SIN_LIMITE);
        assert.ok(!/product\?\.stock \?\? 0/.test(form), "el formulario vuelve a reiniciar el inventario a 0");
        assert.match(form, /elInventarioAlAbrir\(/);
    });

    test("«Sin stock» son las de CERO unidades: el -1 es sin límite", () => {
        assert.equal(reglas.estaAgotado(0), true);
        assert.equal(reglas.estaAgotado(-1), false);
        assert.equal(reglas.estaAgotado(3), false);
        assert.equal(reglas.elInventarioQueSeLee(-1), "Sin límite");
        assert.equal(reglas.elInventarioQueSeLee(4), "4");
        assert.ok(!/stock: \{ lte: 0 \}/.test(acciones), "«Sin stock» vuelve a contar el -1");
    });

    test("el buscador mira el nombre, el código y la categoría", () => {
        const donde = reglas.dondeBusca("origen");
        assert.deepEqual(donde.map((d) => Object.keys(d)[0]), ["title", "sku", "category"]);
        assert.match(acciones, /dondeBusca\(/);
    });

    test("reordenar con un filtro puesto no pisa el sitio de lo escondido", () => {
        const todos = ["a", "b", "c", "d", "e"];
        // Con un filtro se ven b y d; se arrastra d encima de b.
        assert.deepEqual(reglas.elOrdenCompleto(todos, ["d", "b"]), ["a", "d", "c", "b", "e"]);
        assert.deepEqual(reglas.elOrdenCompleto(todos, ["a", "b", "c", "d", "e"]), todos);
        assert.match(acciones, /elOrdenCompleto\(/);
    });

    test("guardar sin lo obligatorio dice por qué, con el nombre del campo", () => {
        assert.match(reglas.porQueNoSeGuardaElProducto({ category: {} }), /Categoría/);
        assert.match(reglas.porQueNoSeGuardaElProducto({ title: {}, price: {} }), / y /);
        assert.ok(reglas.porQueNoSeGuardaElProducto({}).length > 0);
        assert.match(form, /porQueNoSeGuardaElProducto\(/);
    });

    test("la pantalla lleva las marcas que usan las capturas", () => {
        const guion = readFileSync(path.join(RAIZ, "scripts/capturar-guia-productos.mjs"), "utf8");
        for (const m of ["data-tabla-de-productos", "data-fila-de-producto", "data-asa-de-producto", "data-eliminar-producto", "data-editar-producto", "data-formulario-del-producto", "data-pie-del-producto", "data-ver-catalogo", "data-cupo-del-plan"]) {
            assert.ok((form + tabla + main).includes(m), `a la pantalla le falta ${m}`);
            assert.ok(guion.includes(m), `el guion de capturas ya no usa ${m}`);
        }
        assert.match(guion, /conElDominioDeLaGuia\(ctx, BASE\)/);
    });
}
