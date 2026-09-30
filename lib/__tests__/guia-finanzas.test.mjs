/**
 * El banco de la GUÍA PÚBLICA de Finanzas (`/guia/finanzas`).
 *
 * Las mismas cuatro cosas que las guías de Leads, Catálogo, Diagramas,
 * Reuniones y Mis notas, y por el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los accesos de la fila de
 *    arriba (`lib/accesos-de-finanzas.ts`), las columnas de Ventas, Gastos y
 *    Cuentas, los campos de los formularios de una venta y de un gasto, los
 *    campos de fábrica de la ficha de un contacto, los modos del botón de
 *    fecha, las pestañas de los movimientos de una cuenta y los botones de
 *    cada fila se leen del CÓDIGO de esas pantallas. Una columna o un acceso
 *    nuevo sin su nombre en la guía pone esto en rojo, con el nombre del que
 *    falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de sus dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * `MODO=roto` lee los ficheros de `ANTES_FINANZAS_REF` —pinchado a un commit,
 * nunca `origin/main`— y afirma que no había guía de Finanzas, ni su tarjeta
 * en «Tutoriales del módulo», ni las marcas con las que una receta señala las
 * partes de sus pantallas.
 *
 * Se levanta con `scripts/banco-guia-finanzas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_FINANZAS_REF ?? "ab6b110";

const FINANZAS = "app/(root)/(protected)/dashboard/finance";
const COMUNES = `${FINANZAS}/_components`;

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
 * Las columnas de una tabla de movimientos, en su orden, tal como las arma su
 * `build…Columns`: las comunes (`columnaDeConcepto`…) llevan su encabezado en
 * `ColumnasDeMovimientos.tsx`, y las propias van escritas en línea
 * (`header: 'Tipo'`). La columna de acciones no tiene encabezado y no cuenta.
 */
export function lasColumnasDe(columnas, comunes) {
    const nombreDe = new Map();
    for (const m of comunes.matchAll(/export function (columnaDe\w+)[\s\S]*?(?:etiqueta: '([^']+)'|header: '([^']+)')/g)) {
        nombreDe.set(m[1], m[2] ?? m[3]);
    }
    const ini = columnas.indexOf("return [");
    const cuerpo = columnas.slice(ini);
    const salida = [];
    for (const m of cuerpo.matchAll(/(columnaDe\w+)<|header: '([^']*)'/g)) {
        if (m[1]) salida.push(nombreDe.get(m[1]) ?? `?${m[1]}`);
        else if (m[2]) salida.push(m[2]);
    }
    return salida;
}

/** Los rótulos de los `MiniField` del formulario, desde su título hasta la columna de la derecha. */
export function losCamposDelFormulario(fuente, titulo) {
    const ini = fuente.indexOf(titulo);
    if (ini < 0) return [];
    const finDerecha = fuente.indexOf("{/* RIGHT */}", ini);
    const trozo = fuente.slice(ini, finDerecha > 0 ? finDerecha : undefined);
    return [...trozo.matchAll(/<MiniField label="([^"]+)"/g)].map((m) => m[1]);
}

if (ROTO) {
    test("ANTES no había guía pública de Finanzas", () => {
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_FINANZAS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.equal(leer("lib/guia-finanzas.ts"), "", "lib/guia-finanzas.ts ya existía en ANTES_FINANZAS_REF");
        assert.equal(leer("app/guia/finanzas/page.tsx"), "", "la página ya existía en ANTES_FINANZAS_REF");
        assert.ok(!/["']finanzas["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía de Finanzas");
        assert.ok(!/modulo: "finanzas"/.test(leer("lib/tutoriales-del-modulo.ts")), "«Tutoriales del módulo» ya tenía la tarjeta de Finanzas");
    });

    test("ANTES las pantallas de Finanzas no exponían con qué señalarlas", () => {
        // Sin estas marcas, las recetas tendrían que buscar por coordenadas: un
        // botón que se mueve se lleva la flecha a otro sitio.
        const todo = [
            `${COMUNES}/FinanceModuleShortcuts.tsx`,
            `${FINANZAS}/page.tsx`,
            `${COMUNES}/FiltroDePeriodo.tsx`,
            `${COMUNES}/TablaDeFinanzas.tsx`,
        ].map(leer).join("\n");
        for (const marca of ["data-accesos-de-finanzas", "data-resumen-anual", "data-grafica-del-mes", "data-filtro-de-periodo"]) {
            assert.ok(!todo.includes(marca), `ya existía «${marca}»`);
        }
        // Y la fila de accesos no llevaba al Resumen: desde Ventas no había
        // forma de volver a la pantalla de partida sin subir a las pestañas.
        assert.equal(leer("lib/accesos-de-finanzas.ts"), "", "los accesos ya vivían en un módulo aparte");
        assert.ok(!/label: ['"]Resumen['"]|etiqueta: ['"]Resumen['"]/.test(leer(`${COMUNES}/FinanceModuleShortcuts.tsx`)), "ya había un acceso al Resumen");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-finanzas/guia-finanzas.mjs"));

    test("los accesos documentados son EXACTAMENTE los de la fila de arriba, en su orden", () => {
        const enLaPantalla = [...leer("lib/accesos-de-finanzas.ts").matchAll(/etiqueta: "([^"]+)"/g)].map((m) => m[1]);
        assert.equal(enLaPantalla.length, 12, `no se leyeron los doce accesos: ${JSON.stringify(enLaPantalla)}`);
        assert.deepEqual([...guia.ACCESOS_DOCUMENTADOS], enLaPantalla);
        // Y la fila los pinta desde esa lista, no desde una suya.
        assert.match(leer(`${COMUNES}/FinanceModuleShortcuts.tsx`), /ACCESOS_DE_FINANZAS/);
        // Las seis subpantallas se nombran en algún paso de la guía.
        const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => p.texto)).join(" \n ");
        for (const x of ["Ventas", "Gastos", "Clientes", "Proveedores", "Cuentas", "Configuración", "Resumen"]) {
            assert.ok(todo.includes(x), `ningún paso de la guía nombra «${x}»`);
        }
    });

    test("las columnas de Ventas, Gastos y Cuentas son las de sus tablas", () => {
        const comunes = leer(`${COMUNES}/ColumnasDeMovimientos.tsx`);
        assert.deepEqual([...guia.COLUMNAS_DE_VENTAS], lasColumnasDe(leer(`${FINANZAS}/sales/_components/columns.tsx`), comunes));
        assert.deepEqual([...guia.COLUMNAS_DE_GASTOS], lasColumnasDe(leer(`${FINANZAS}/expenses/_components/columns.tsx`), comunes));
        const cuentas = [...leer(`${FINANZAS}/accounts/_components/columns.tsx`).matchAll(/header: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual([...guia.COLUMNAS_DE_CUENTAS], cuentas);
        // Y el paso de cada lista las nombra.
        const textoDe = (slug, imagen) => guia.laSeccion(slug).pasos.find((p) => p.imagen === imagen).texto.toLowerCase();
        for (const c of guia.COLUMNAS_DE_VENTAS) assert.ok(textoDe("ventas", "ventas-lista.webp").includes(c.toLowerCase()), `«La lista de ventas» no nombra la columna «${c}»`);
        assert.match(textoDe("gastos", "gastos-lista.webp"), /tipo/);
        for (const c of ["ventas", "gastos", "saldo"]) assert.ok(textoDe("cuentas", "cuentas-lista.webp").includes(c), `«El saldo de cada cuenta» no nombra «${c}»`);
    });

    test("los campos de una venta, de un gasto y de la ficha de un contacto son los de sus formularios", () => {
        assert.deepEqual([...guia.CAMPOS_DE_UNA_VENTA], losCamposDelFormulario(leer(`${FINANZAS}/sales/_components/MainSales.tsx`), "'Nueva venta'"));
        assert.deepEqual([...guia.CAMPOS_DE_UN_GASTO], losCamposDelFormulario(leer(`${FINANZAS}/expenses/_components/MainExpenses.tsx`), "'Nuevo gasto'"));
        const deFabrica = leer("lib/finance-contact-fields.ts");
        const ini = deFabrica.indexOf("export function defaultFields");
        const etiquetas = [...deFabrica.slice(ini, deFabrica.indexOf("];", ini)).matchAll(/label: (?:'([^']+)'|codeLabel)/g)].map((m) => m[1] ?? "Cliente");
        assert.deepEqual([...guia.CAMPOS_DE_UN_CONTACTO], etiquetas);
        // El código se pone solo, con su letra: C en un cliente y P en un proveedor. El campo lo dice
        // con la MISMA función que el servidor usa para ponerlo, y la guía lo cuenta igual.
        assert.match(leer(`${FINANZAS}/_contacts/MainFinanceContacts.tsx`), /elCodigoAutomatico\(kind\)/);
        assert.match(leer("actions/finance-contacts-actions.ts"), /elSiguienteCodigo\(elPrefijoDelContacto\(/);
        assert.match(guia.laSeccion("clientes").pasos.find((p) => p.imagen === "clientes-nuevo.webp").texto, /C-1, C-2/);
        assert.match(guia.laSeccion("proveedores").pasos.find((p) => p.imagen === "proveedores-nuevo.webp").texto, /P-1, P-2/);
    });

    test("«Fijo o variable» nombra EXACTAMENTE las categorías que la columna Tipo da por fijas", () => {
        const tabla = leer("lib/tabla-de-finanzas.ts");
        const ini = tabla.indexOf("export const CATEGORIAS_DE_GASTO_FIJO");
        assert.ok(ini >= 0, "no está la lista de categorías fijas");
        const fijas = [...tabla.slice(ini, tabla.indexOf("] as const", ini)).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
        assert.ok(fijas.length >= 5, `no se leyeron las categorías fijas: ${JSON.stringify(fijas)}`);
        const texto = guia.laSeccion("gastos").pasos.find((p) => p.imagen === "gastos-tipo.webp").texto;
        const sinTildes = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        for (const c of fijas) assert.ok(sinTildes(texto).includes(sinTildes(c)), `el paso no nombra la categoría fija «${c}»`);
    });

    test("el botón de fecha y los movimientos de una cuenta ofrecen lo que la guía dice", () => {
        const filtro = leer(`${COMUNES}/FiltroDePeriodo.tsx`);
        const modos = [...filtro.matchAll(/\{ label: '([^']+)', value: '(?:todo|mes|rango)' \}/g)].map((m) => m[1]);
        assert.deepEqual([...guia.MODOS_DEL_PERIODO], modos);
        const cuentas = leer(`${FINANZAS}/accounts/_components/MainFinanceAccounts.tsx`);
        const ini = cuentas.indexOf("VISTAS_DEL_DETALLE");
        const vistas = [...cuentas.slice(ini, cuentas.indexOf("];", ini)).matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual([...guia.MOVIMIENTOS_DE_UNA_CUENTA], vistas);
        // El filtro es el MISMO en las tres pantallas que la guía dice.
        for (const f of [`${FINANZAS}/sales/_components/MainSales.tsx`, `${FINANZAS}/expenses/_components/MainExpenses.tsx`, `${FINANZAS}/accounts/_components/MainFinanceAccounts.tsx`]) {
            assert.match(leer(f), /<FiltroDePeriodo /, `${f} no usa el botón de fecha común`);
        }
    });

    test("los botones de cada fila, la estrella y Vaciar contabilidad existen donde la guía dice", () => {
        const fila = leer(`${COMUNES}/AccionesDeLaFila.tsx`);
        assert.match(fila, /etiqueta="Editar"/);
        assert.match(fila, /etiqueta="Eliminar"/);
        assert.match(fila, /AlertDialog/, "eliminar tiene que pedir confirmación");
        assert.match(leer(`${FINANZAS}/accounts/_components/columns.tsx`), /Marcar como predeterminada/);
        assert.match(leer(`${COMUNES}/BarraDeFinanzas.tsx`), /etiqueta: 'Vaciar contabilidad'/);
        assert.match(leer(`${COMUNES}/VaciarContabilidad.tsx`), /VACIAR/);
        assert.match(leer(`${COMUNES}/TablaDeFinanzas.tsx`), /data-boton="columnas"/);
    });

    test("la vista general numera las siete zonas, en su orden", () => {
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "vista-general.webp").texto;
        guia.ZONAS_DE_LA_PANTALLA.forEach((z, i) => assert.ok(texto.includes(`${i + 1} ${z}`), `la vista general no numera «${z}» como ${i + 1}`));
    });

    test("la guía cubre el resumen y sus seis pantallas, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "resumen", "ventas", "gastos", "periodo", "clientes", "proveedores", "cuentas", "configuracion", "acciones"]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/finanzas/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("acciones").siguiente, null);
        assert.equal(guia.lasVecinas("ventas").anterior.slug, "resumen");
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"finanzas"/);
    });

    test("la tarjeta de «Tutoriales del módulo» se llama «Guía de Finanzas» y lleva su descripción", () => {
        const tutoriales = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{\s*modulo: "finanzas",\s*ruta: "([^"]+)",\s*contenido: GUIA_FINANZAS,\s*tarjeta: "([^"]+)"/.exec(tutoriales);
        assert.ok(fila, "falta la fila de Finanzas en GUIAS_PUBLICADAS");
        assert.equal(fila[1], guia.RUTA_DE_FINANZAS);
        assert.match(fila[2], /^Aprende a .+ en la plataforma$/);
        assert.ok(fila[2].length <= 75, `la descripción mide ${fila[2].length} caracteres`);
        assert.ok(!/[[\]]/.test(fila[2]), "la descripción lleva corchetes literales");
        assert.equal(guia.GUIA_FINANZAS.titulo, "Finanzas", "la tarjeta se titula «Guía de <título>»");
    });

    test("cada paso es corto: la captura explica, el texto pone nombre", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 220, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "finanzas");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/finanzas/${n}`);
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
        for (const f of ["app/guia/finanzas/page.tsx", "app/guia/finanzas/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/finanzas/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deFinanzas = [["FINANZAS", "·"], ["Finanzas", "·"], ["finanzas", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/finanzas/${rel}`), deFinanzas),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/finanzas/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
