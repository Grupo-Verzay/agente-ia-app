/**
 * El banco de la GUÍA PÚBLICA de Conexión y Ajustes (`/guia/conexion`).
 *
 * Las mismas cuatro cosas que las demás guías, y por el mismo motivo —se
 * rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las ocho pestañas salen de la
 *    lista que pinta la pantalla (`PESTANAS_DEL_PERFIL`); los canales, las
 *    tarjetas de cada pestaña, los interruptores del escalado, los tiempos y
 *    las frases, el botón del plan, los campos de Seguridad y las opciones de
 *    Apariencia se buscan en el CÓDIGO de `/profile`. Uno que cambie de nombre
 *    sin cambiarlo en la guía pone esto en rojo.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de sus dos páginas es el de Leads
 *    con otro nombre, letra por letra.
 *
 * Y lo que se arregló en la pantalla al documentarla.
 *
 * `MODO=roto` lee `ANTES_CONEXION_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía, ni marcas en la pantalla, y los
 * fallos de la pantalla.
 *
 * Se levanta con `scripts/banco-guia-conexion.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_CONEXION_REF ?? "de0cd9d";

const D = "app/(root)/profile/_components";
const PERFIL = `${D}/UserInformation.tsx`;
const PLAN = `${D}/PlanBillingCard.tsx`;
const DIAL = `${D}/PlanSpeedDial.tsx`;
const IA = `${D}/ApiKeyConfigurator.tsx`;

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

/** Todo el código de la pantalla (y de las tarjetas de Conexión que monta). */
const elCodigoDeLaPantalla = () => {
    const dirs = [D, "app/(root)/connection/_components"];
    return dirs
        .flatMap((d) => readdirSync(path.join(RAIZ, d)).filter((n) => n.endsWith(".tsx")).map((n) => `${d}/${n}`))
        .concat(["components/font-size-control.tsx", "components/color-mode-control.tsx"])
        .map(leer)
        .join("\n");
};

if (ROTO) {
    test("ANTES no había guía pública de Conexión y Ajustes", () => {
        assert.equal(leer("lib/guia-conexion.ts"), "", "lib/guia-conexion.ts ya existía");
        assert.equal(leer("app/guia/conexion/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_CONEXION_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/"conexion"/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/modulo:\s*"conexion"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
    });

    test("ANTES la pantalla no exponía marcas para una receta", () => {
        const perfil = leer(PERFIL);
        for (const marca of ["data-pestana-del-perfil", "data-panel-del-perfil", "data-ficha-del-perfil"]) {
            assert.ok(!perfil.includes(marca), `la pantalla ya tenía «${marca}»`);
        }
        assert.ok(!leer(DIAL).includes("data-acciones-del-plan"), "el botón del plan ya tenía su marca");
    });

    test("ANTES el plan decía la moneda dos veces y el botón del plan escondía sus rótulos", () => {
        assert.match(leer(PLAN), /COP\s*\}?\s*\/mes|currency[\s\S]{0,80}\/mes/, "el plan no pegaba la moneda al «/mes»");
        assert.match(leer(DIAL), /opacity-0 group-hover:opacity-100/, "los rótulos del botón del plan ya se veían");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-conexion/guia-conexion.mjs"));
    const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const codigo = elCodigoDeLaPantalla();
    const nombra = (lista, que) => {
        for (const x of lista) assert.ok(todo.includes(x), `ningún paso nombra ${que} «${x}»`);
    };
    const existe = (lista, que) => {
        for (const x of lista) assert.ok(codigo.includes(x), `la pantalla no tiene ${que} «${x}»`);
    };

    test("las ocho pestañas son las de la pantalla, en su orden, y la guía las nombra", () => {
        const pantalla = leer("lib/pantalla-de-perfil.ts");
        const enCodigo = [...pantalla.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
        assert.equal(enCodigo.length, 8);
        assert.deepEqual([...guia.PESTANAS_DOCUMENTADAS], enCodigo);
        assert.match(leer(PERFIL), /PESTANAS_DEL_PERFIL/, "la pantalla no lee sus pestañas de la lista compartida");
        nombra(guia.PESTANAS_DOCUMENTADAS, "la pestaña");
        // Un apartado por pestaña, en el mismo orden.
        const porPestana = guia.SECCIONES.slice(1).map((s) => s.slug);
        assert.deepEqual(porPestana, ["conexion", "integraciones", "preferencias", "comportamiento", "herramientas", "cuenta", "seguridad", "apariencia"]);
    });

    test("los canales y las tarjetas de cada pestaña existen en la pantalla, y la guía los nombra", () => {
        existe(guia.CANALES_DOCUMENTADOS, "el canal");
        nombra(guia.CANALES_DOCUMENTADOS.map((c) => c.replace(/^Mensajería /, "").replace(/ \(QR\)$/, "")), "el canal");
        for (const [pestana, tarjetas] of Object.entries(guia.TARJETAS_DE_CADA_PESTANA)) {
            existe(tarjetas, `en ${pestana} la tarjeta`);
            nombra(tarjetas, `en ${pestana} la tarjeta`);
        }
    });

    test("escalado, tiempos, frases, plan, seguridad y apariencia dicen lo que la pantalla", () => {
        assert.deepEqual(
            [...guia.OPCIONES_DEL_ESCALADO].filter((o) => leer(`${D}/EscaladoCard.tsx`).includes(o)),
            [...guia.OPCIONES_DEL_ESCALADO],
        );
        nombra(guia.OPCIONES_DEL_ESCALADO, "la opción del escalado");
        existe(guia.TIEMPOS_Y_FRASES, "el ajuste");
        nombra(guia.TIEMPOS_Y_FRASES, "el ajuste");
        const dial = [...leer(DIAL).matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual([...guia.ACCIONES_DEL_PLAN], dial);
        nombra(guia.ACCIONES_DEL_PLAN, "la acción del plan");
        existe([...guia.CAMPOS_DEL_CORREO, ...guia.CAMPOS_DE_LA_CONTRASENA], "el campo");
        nombra([...guia.CAMPOS_DEL_CORREO, ...guia.CAMPOS_DE_LA_CONTRASENA], "el campo");
        existe([...guia.TAMANOS_DE_LETRA, ...guia.MODOS_DE_COLOR], "la opción");
        nombra([...guia.TAMANOS_DE_LETRA, ...guia.MODOS_DE_COLOR], "la opción");
    });

    test("lo que se arregló en la pantalla al documentarla", () => {
        assert.match(leer(PLAN), /elMontoAlMes/, "el plan vuelve a escribir la moneda a mano");
        assert.match(leer(IA), /OpenAI/);
        assert.doesNotMatch(leer(IA), /OpenIA/, "vuelve a decir «OpenIA»");
        const dial = leer(DIAL);
        assert.doesNotMatch(dial, /opacity-0 group-hover:opacity-100/, "los rótulos del botón del plan vuelven a esconderse");
        assert.doesNotMatch(dial, /<a\b(?:(?!<\/a>)[\s\S])*<button/, "un botón dentro de un enlace");
        assert.match(dial, /data-acciones-del-plan/);
        const perfil = leer(PERFIL);
        for (const marca of ["data-pestana-del-perfil", "data-panel-del-perfil", "data-ficha-del-perfil"]) assert.ok(perfil.includes(marca), `falta «${marca}»`);
    });

    test("la guía cubre la pantalla, y cada sección tiene su página", () => {
        const pagina = leer("app/guia/conexion/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("apariencia").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"conexion"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /conexion:/);
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

    test("la tarjeta de «Tutoriales del módulo» sale sola en /profile, con su descripción", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{[^{}]*modulo:\s*"conexion"[^{}]*\}/.exec(t)?.[0] ?? "";
        assert.ok(fila, "no hay fila de conexion en GUIAS_PUBLICADAS");
        assert.match(fila, /ruta:\s*"\/profile"/);
        const tarjeta = /tarjeta:\s*"([^"]+)"/.exec(fila)?.[1] ?? "";
        assert.match(tarjeta, /^Aprende a [^[\]]+ en la plataforma$/);
        assert.ok([...tarjeta].length <= 75);
        assert.equal(guia.GUIA_CONEXION.titulo, "Conexión y Ajustes");
        assert.ok(leer("scripts/sembrar-guia-conexion.mjs").includes(`description: "${tarjeta}"`), "la semilla dice otra descripción");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "conexion");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/conexion/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 3, `${n} pesa ${kb.toFixed(1)} KB: no parece una captura`);
            assert.ok(kb < 600, `${n} pesa ${kb.toFixed(0)} KB`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA y NO se indexa, y no toca la base", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/conexion/page.tsx", "app/guia/conexion/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deConexion = [["Conexión y Ajustes", "·"], ["CONEXION", "·"], ["Conexion", "·"], ["conexion", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/conexion/${rel}`), deConexion), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/conexion/${rel} no es la de Leads con otro nombre`);
        }
    });
}
