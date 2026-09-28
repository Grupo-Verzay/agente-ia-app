/**
 * Cotizaciones de la IA: la REGLA y el PDF, sin base.
 *
 * Lo que se prueba es la parte que decide si una cotización se puede hacer
 * sin inventar nada: que el precio sale del catálogo, que lo que no está —o
 * pide un descuento— escala, que lo ambiguo se pregunta, y que el PDF lleva el
 * negocio, las líneas, el total y las condiciones.
 *
 * `MODO=roto` lee el árbol de ANTES_REF y afirma que nada de esto existía: ni
 * la pestaña, ni la regla, ni la ruta.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMP = join(AQUI, ".compilado", "cotizacion-ia");
const MODO = process.env.MODO ?? "bueno";
const ANTES_REF = process.env.ANTES_REF ?? "8b1bdab";

const enAntes = (ruta) => {
    try {
        return execSync(`git show ${ANTES_REF}:"${ruta}"`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return null;
    }
};

if (MODO === "roto") {
    test("ANTES · no había pestaña de Cotizaciones en el entrenamiento", () => {
        const etiquetas = enAntes("app/(root)/ai/_components/ai-section-labels.ts");
        assert.ok(etiquetas, "no se pudo leer el archivo de antes");
        assert.doesNotMatch(etiquetas, /Cotizaciones/);
    });
    test("ANTES · no había regla, ni ruta, ni ajustes de cotización de la IA", () => {
        assert.equal(enAntes("lib/cotizacion-ia.ts"), null);
        assert.equal(enAntes("app/api/cotizacion-ia/route.ts"), null);
        assert.equal(enAntes("lib/cotizacion-ia-db.ts"), null);
    });
    test("ANTES · el middleware mandaba /api/cotizacion-ia al login", () => {
        const mw = enAntes("middleware.ts");
        assert.doesNotMatch(mw, /cotizacion-ia/);
    });
} else {
    const R = await import(join(COMP, "cotizacion-ia.js"));
    const P = await import(join(COMP, "cotizacion-en-pdf.js"));
    const require = createRequire(import.meta.url);
    const pdfjs = require(join(RAIZ, "node_modules/pdfjs-dist/legacy/build/pdf.js"));

    const CATALOGO = [
        { id: "p1", title: "Camisa azul", sku: "CAM-AZ", price: 45000 },
        { id: "p2", title: "Camisa roja", sku: "CAM-RO", price: 47000 },
        { id: "p3", title: "Pantalón jean", sku: "PAN-01", price: 89900.5 },
        { id: "p4", title: "Instalación a domicilio", sku: null, price: 30000 },
    ];

    test("comoAjustes · solo `true` enciende, y el texto se recorta", () => {
        assert.deepEqual(R.comoAjustes(null), { activa: false, instrucciones: "" });
        assert.equal(R.comoAjustes({ activa: "true" }).activa, false);
        assert.equal(R.comoAjustes({ activa: 1 }).activa, false);
        assert.equal(R.comoAjustes({ activa: true }).activa, true);
        assert.equal(R.comoAjustes({ instrucciones: "  Validez 15 días \r\n" }).instrucciones, "Validez 15 días");
        assert.equal(R.comoAjustes({ instrucciones: "x".repeat(9000) }).instrucciones.length, R.TOPE_DE_INSTRUCCIONES);
    });

    test("comoPedidos · la cantidad es un entero >= 1, y lo vacío se descarta", () => {
        const p = R.comoPedidos([
            { producto: " Camisa azul ", cantidad: 3 },
            { producto: "", cantidad: 2 },
            { producto: "Pantalón jean", cantidad: -4 },
            { producto: "Instalación", cantidad: "2.7" },
            { producto: "X", cantidad: 99999999 },
        ]);
        assert.deepEqual(p, [
            { producto: "Camisa azul", cantidad: 3 },
            { producto: "Pantalón jean", cantidad: 1 },
            { producto: "Instalación", cantidad: 2 },
            { producto: "X", cantidad: R.TOPE_DE_CANTIDAD },
        ]);
        assert.deepEqual(R.comoPedidos("nada"), []);
    });

    test("emparejar · por código, por nombre sin tildes, y por palabras (con plural)", () => {
        assert.equal(R.emparejar("cam-az", CATALOGO).producto.id, "p1");
        assert.equal(R.emparejar("PANTALON JEAN", CATALOGO).producto.id, "p3");
        assert.equal(R.emparejar("camisas azules", CATALOGO).producto.id, "p1");
        assert.equal(R.emparejar("quiero la instalacion a domicilio por favor", CATALOGO).producto.id, "p4");
        assert.equal(R.emparejar("camisa", CATALOGO).tipo, "varios");
        assert.equal(R.emparejar("zapatos", CATALOGO).tipo, "ninguno");
    });

    test("decidir · el precio sale del CATÁLOGO y se suma bien", () => {
        const d = R.decidirLaCotizacion({
            activa: true,
            pedidos: [{ producto: "Camisa azul", cantidad: 3 }, { producto: "pantalon jean", cantidad: 2 }],
            pideCondicionesEspeciales: false,
            catalogo: CATALOGO,
        });
        assert.equal(d.estado, "lista");
        assert.deepEqual(d.lineas.map((l) => [l.titulo, l.cantidad, l.precioUnitario, l.subtotal]), [
            ["Camisa azul", 3, 45000, 135000],
            ["Pantalón jean", 2, 89900.5, 179801],
        ]);
        assert.equal(d.total, 314801);
    });

    test("decidir · lo mismo pedido dos veces es UNA línea", () => {
        const d = R.decidirLaCotizacion({
            activa: true,
            pedidos: [{ producto: "Camisa azul", cantidad: 1 }, { producto: "CAM-AZ", cantidad: 2 }],
            pideCondicionesEspeciales: false,
            catalogo: CATALOGO,
        });
        assert.equal(d.lineas.length, 1);
        assert.equal(d.lineas[0].cantidad, 3);
        assert.equal(d.total, 135000);
    });

    test("decidir · lo que NO está en el catálogo escala, y no cotiza NADA", () => {
        const d = R.decidirLaCotizacion({
            activa: true,
            pedidos: [{ producto: "Camisa azul", cantidad: 1 }, { producto: "Zapatos de cuero", cantidad: 1 }],
            pideCondicionesEspeciales: false,
            catalogo: CATALOGO,
        });
        assert.equal(d.estado, "escalar");
        assert.deepEqual(d.faltan, ["Zapatos de cuero"]);
        assert.match(d.motivo, /Zapatos de cuero/);
        assert.equal(d.lineas, undefined);
    });

    test("decidir · un descuento pedido escala aunque todo exista (por la marca y por el texto)", () => {
        const base = { activa: true, pedidos: [{ producto: "Camisa azul", cantidad: 10 }], catalogo: CATALOGO };
        assert.equal(R.decidirLaCotizacion({ ...base, pideCondicionesEspeciales: true, detalleCondiciones: "pide 20% off" }).estado, "escalar");
        assert.equal(R.decidirLaCotizacion({ ...base, pideCondicionesEspeciales: false, detalleCondiciones: "quiere un descuento por volumen" }).estado, "escalar");
        assert.equal(
            R.decidirLaCotizacion({ ...base, pedidos: [{ producto: "Camisa azul con descuento", cantidad: 1 }], pideCondicionesEspeciales: false }).estado,
            "escalar",
        );
        // «promociones» NO es «promo» a secas: se compara por palabra entera.
        assert.equal(R.hablaDeCondicionesEspeciales("Camisa promocional"), false);
    });

    test("decidir · lo ambiguo se PREGUNTA, no se escala", () => {
        const d = R.decidirLaCotizacion({
            activa: true,
            pedidos: [{ producto: "camisa", cantidad: 1 }],
            pideCondicionesEspeciales: false,
            catalogo: CATALOGO,
        });
        assert.equal(d.estado, "aclarar");
        assert.deepEqual(d.opciones[0].candidatos.sort(), ["Camisa azul", "Camisa roja"]);
    });

    test("decidir · apagada no cotiza nada; sin productos es «vacía»", () => {
        assert.equal(R.decidirLaCotizacion({ activa: false, pedidos: [{ producto: "Camisa azul", cantidad: 1 }], pideCondicionesEspeciales: false, catalogo: CATALOGO }).estado, "apagada");
        assert.equal(R.decidirLaCotizacion({ activa: true, pedidos: [], pideCondicionesEspeciales: false, catalogo: CATALOGO }).estado, "vacia");
    });

    test("decidir · un precio que no se puede leer cuenta como que no está (nunca se inventa)", () => {
        const d = R.decidirLaCotizacion({
            activa: true,
            pedidos: [{ producto: "Raro", cantidad: 1 }],
            pideCondicionesEspeciales: false,
            catalogo: [{ id: "r", title: "Raro", price: Number.NaN }],
        });
        assert.equal(d.estado, "escalar");
    });

    test("los datos del negocio salen de Perfil, sin huecos", () => {
        assert.deepEqual(R.losDatosDelNegocio({ ubicacion: "Cra 7 # 12", telefono: "3001234567", email: "", sitio: "tienda.co" }), [
            "Cra 7 # 12",
            "Tel: 3001234567",
            "tienda.co",
        ]);
        assert.deepEqual(R.losDatosDelNegocio(null), []);
    });

    async function leerPdf(bytes) {
        const doc = await pdfjs.getDocument({
            data: new Uint8Array(bytes),
            disableFontFace: true,
            useSystemFonts: false,
            standardFontDataUrl: join(RAIZ, "node_modules/pdfjs-dist/standard_fonts") + "/",
        }).promise;
        let todo = "";
        let imagenes = 0;
        for (let i = 1; i <= doc.numPages; i++) {
            const p = await doc.getPage(i);
            todo += (await p.getTextContent()).items.map((it) => it.str).join("\n") + "\n";
            const ops = await p.getOperatorList();
            imagenes += ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintJpegXObject).length;
        }
        return { todo, imagenes, paginas: doc.numPages };
    }

    const LOGO_PNG = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DwnwEIGBkZGBgYAAAgBgMBXwQlMQAAAABJRU5ErkJggg==",
        "base64",
    );

    test("el PDF lleva logo, negocio, cliente, cada línea, el total y las condiciones", async () => {
        const d = R.decidirLaCotizacion({
            activa: true,
            pedidos: [{ producto: "Camisa azul", cantidad: 3 }, { producto: "Instalación a domicilio", cantidad: 1 }],
            pideCondicionesEspeciales: false,
            catalogo: CATALOGO,
        });
        const bytes = await P.cotizacionEnPdf({
            numero: "COT-20260928-ABCDE",
            fecha: new Date("2026-09-28T15:00:00Z"),
            zonaHoraria: "America/Bogota",
            marca: { nombre: "Tienda Ñandú", logo: { bytes: new Uint8Array(LOGO_PNG), formato: "png" } },
            datosDelNegocio: ["Cra 7 # 12", "Tel: 3001234567"],
            cliente: "Marta Gómez",
            telefonoDelCliente: "573001112233",
            lineas: d.lineas,
            total: d.total,
            moneda: "COP",
            condiciones: "Validez de 15 días.\nPrecios con IVA incluido 🙂",
        });
        const { todo, imagenes } = await leerPdf(bytes);
        assert.equal(imagenes, 1, "el logo no se incrustó");
        for (const esperado of ["Tienda Ñandú", "COTIZACIÓN", "COT-20260928-ABCDE", "Marta Gómez", "Camisa azul", "Instalación a domicilio", "$ 135.000", "$ 30.000", "$ 165.000 COP", "Validez de 15 días.", "Precios con IVA incluido", "Cra 7 # 12"]) {
            assert.ok(todo.includes(esperado), `falta «${esperado}» en el PDF`);
        }
    });

    test("el PDF sin logo pinta las iniciales, sin condiciones no pinta la sección, y muchas líneas pasan de página", async () => {
        const lineas = Array.from({ length: 60 }, (_, i) => ({ productoId: `p${i}`, titulo: `Producto número ${i}`, cantidad: 1, precioUnitario: 1000, subtotal: 1000 }));
        const bytes = await P.cotizacionEnPdf({
            numero: "COT-1", fecha: new Date(), zonaHoraria: "America/Bogota",
            marca: { nombre: "Verzay Ventas", logo: null }, datosDelNegocio: [], cliente: "Cliente",
            lineas, total: 60000, moneda: null, condiciones: "",
        });
        const { todo, imagenes, paginas } = await leerPdf(bytes);
        assert.equal(imagenes, 0);
        assert.ok(todo.includes("VV"), "sin logo tienen que salir las iniciales");
        assert.ok(!todo.includes("CONDICIONES"));
        assert.ok(paginas >= 2, "60 líneas caben en una página: no se probó el salto");
        assert.ok(todo.includes("Producto número 59"), "se perdió la última línea al pasar de página");
    });

    test("el nombre del archivo y el número", () => {
        assert.equal(P.elNombreDelPdf("COT-20260928-ABCDE"), "Cotizacion-COT-20260928-ABCDE.pdf");
        assert.match(R.elNumeroDeLaCotizacion("1a2b3c4d-xyz", new Date(2026, 8, 28)), /^COT-20260928-1A2B3$/);
    });
}
