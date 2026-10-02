/**
 * El banco de la GUÍA PÚBLICA de Llamadas (`/guia/llamadas`).
 *
 * Las mismas cuatro cosas que las guías de Leads y de Respuestas Rápidas:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los filtros de dirección, las
 *    columnas, los resultados, los botones de la ventana de llamar, el «⋯» de
 *    cada llamada, el «⋯» de la barra y las partes del detalle se leen de
 *    `CallsCrmClient.tsx`, `DialogoDeLlamar.tsx`, `CallDetailDialog.tsx` y
 *    `lib/call-dispositions.ts`. Un mando nuevo sin su nombre en la guía pone
 *    esto en rojo.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa.**
 * 4. **Es simétrica con Leads**: sus dos páginas son las de Leads con otro
 *    nombre, letra por letra.
 *
 * Y la tarjeta de «Tutoriales del módulo» sale sola en `/crm/llamadas`.
 *
 * `MODO=roto` lee `ANTES_LLAMADAS_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía de Llamadas.
 *
 * Se levanta con `scripts/banco-guia-llamadas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_LLAMADAS_REF ?? "2c7b35e";

const PANTALLA = "app/(root)/crm/llamadas/_components";
const CLIENTE = `${PANTALLA}/CallsCrmClient.tsx`;
const LLAMAR = `${PANTALLA}/DialogoDeLlamar.tsx`;
const DETALLE = `${PANTALLA}/CallDetailDialog.tsx`;

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

/** Las opciones de un `DropdownMenuItem` dentro de un trozo de marcado, en su orden. */
const lasOpciones = (trozo) => [...trozo.matchAll(/<DropdownMenuItem[\s\S]*?(?:\/>|<\/[A-Za-z]+>) ([^<\n]+)\n/g)].map((m) => m[1].trim());

if (ROTO) {
    test("ANTES no había guía pública de Llamadas", () => {
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_LLAMADAS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.equal(leer("lib/guia-llamadas.ts"), "", "lib/guia-llamadas.ts ya existía");
        assert.equal(leer("app/guia/llamadas/page.tsx"), "", "la página ya existía");
        assert.ok(!/"llamadas"/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/crm\/llamadas/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-llamadas/guia-llamadas.mjs"));
    const todo = guia.SECCIONES.flatMap((s) => [s.titulo, s.resumen, ...s.pasos.map((p) => `${p.titulo} ${p.texto}`), ...(s.consejos ?? [])]).join(" \n ");
    const cliente = leer(CLIENTE);

    test("los filtros de dirección son los de la barra, en su orden", () => {
        const ini = cliente.indexOf("DIRECTION_OPTIONS");
        const enLaPantalla = [...cliente.slice(ini, cliente.indexOf("];", ini)).matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual([...guia.DIRECCIONES_DOCUMENTADAS], enLaPantalla);
        for (const d of guia.DIRECCIONES_DOCUMENTADAS) assert.ok(todo.includes(d), `ningún paso nombra «${d}»`);
    });

    test("las columnas documentadas son EXACTAMENTE las del historial, en su orden", () => {
        const enLaPantalla = [...cliente.matchAll(/<Th label="([^"]+)"/g)].map((m) => m[1]);
        assert.equal(enLaPantalla.length, 7, `no se leyeron las columnas: ${JSON.stringify(enLaPantalla)}`);
        assert.deepEqual([...guia.COLUMNAS_DOCUMENTADAS], enLaPantalla);
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "fila.webp").texto;
        guia.COLUMNAS_DOCUMENTADAS.forEach((c, i) => assert.ok(texto.includes(`${i + 1} ${c}`), `la fila no numera «${c}» como ${i + 1}`));
    });

    test("los resultados son los de `CALL_DISPOSITIONS`, y la guía los nombra todos", () => {
        const enElCodigo = [...leer("lib/call-dispositions.ts").matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual([...guia.RESULTADOS_DOCUMENTADOS], enElCodigo);
        for (const r of guia.RESULTADOS_DOCUMENTADOS) assert.ok(todo.includes(r), `ningún paso nombra «${r}»`);
    });

    test("la barra de trabajo: sus cinco partes, en el orden en que se pinta", () => {
        const ini = cliente.indexOf("<BarraDeAcciones");
        const barra = cliente.slice(ini);
        const pos = guia.PARTES_DE_LA_BARRA_DE_TRABAJO.map((p) => barra.indexOf(`${p.zona}={`));
        pos.forEach((x, i) => assert.ok(x >= 0, `la barra no tiene «${guia.PARTES_DE_LA_BARRA_DE_TRABAJO[i].zona}»`));
        assert.deepEqual([...pos].sort((a, b) => a - b), pos, "la guía no numera la barra en el orden en que se pinta");
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "barra.webp").texto;
        guia.PARTES_DE_LA_BARRA_DE_TRABAJO.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.nombre}`), `la barra no numera «${p.nombre}» como ${i + 1}`));
    });

    test("la ventana de llamar: «Llamar IA» a la izquierda y «Llamar» a la derecha", () => {
        const v = leer(LLAMAR);
        const ia = v.indexOf('data-boton="llamar-ia"');
        const tu = v.indexOf('data-boton="llamar"');
        assert.ok(ia >= 0 && tu > ia, "la ventana ya no tiene sus dos botones en ese orden");
        for (const b of guia.BOTONES_DE_LLAMAR) assert.ok(todo.includes(b), `ningún paso nombra «${b}»`);
    });

    test("el «⋯» de cada llamada y el de la barra dicen lo que la guía", () => {
        const fila = cliente.slice(cliente.lastIndexOf('<DropdownMenuContent align="end" className="w-44">'));
        assert.deepEqual(lasOpciones(fila.slice(0, fila.indexOf("</DropdownMenuContent>"))), [...guia.ACCIONES_DE_LA_FILA]);
        const ini = cliente.indexOf("Acciones globales");
        const barra = cliente.slice(ini, cliente.indexOf("</DropdownMenuContent>", ini));
        assert.deepEqual(lasOpciones(barra), [...guia.ACCIONES_DE_LA_BARRA]);
        for (const a of [...guia.ACCIONES_DE_LA_FILA, ...guia.ACCIONES_DE_LA_BARRA]) {
            if (a === "Llamar" || a === "Eliminar") continue;
            assert.ok(todo.includes(a), `ningún paso nombra «${a}»`);
        }
    });

    test("el detalle: grabación, resumen y transcripción, en ese orden", () => {
        const d = leer(DETALLE);
        const pos = guia.PARTES_DEL_DETALLE.map((n) => d.indexOf(`/> ${n}`));
        pos.forEach((x, i) => assert.ok(x >= 0, `el detalle no tiene «${guia.PARTES_DEL_DETALLE[i]}»`));
        assert.deepEqual([...pos].sort((a, b) => a - b), pos);
        for (const n of guia.PARTES_DEL_DETALLE) assert.ok(todo.toLowerCase().includes(n.toLowerCase()), `ningún paso nombra «${n}»`);
    });

    test("el número abre el chat, se agenda un callback, y el mensaje al no contestar", () => {
        assert.match(cliente, /title="Abrir chat del contacto"/);
        assert.match(cliente, /\/chats\?jid=/, "el número ya no abre el chat");
        assert.match(cliente, /Callback agendado\. Lo verás en Tareas\./);
        assert.match(cliente, /missed-call-enabled/);
        assert.match(todo, /Mis tareas|Tareas/);
    });

    test("cubre lo que se pidió, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "llamar", "historial", "abrir-el-chat", "resultado", "callback", "detalle", "mensaje-al-no-contestar"]);
        const pagina = leer("app/guia/llamadas/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("mensaje-al-no-contestar").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"llamadas"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /\bllamadas: \{ titulo: GUIA_LLAMADAS\.titulo/);
    });

    test("cada paso es corto y tiene su texto alternativo", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("la tarjeta de «Tutoriales del módulo» sale sola en /crm/llamadas", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{[^{}]*modulo:\s*"llamadas"[^{}]*\}/.exec(t)?.[0] ?? "";
        assert.ok(fila, "no hay fila de llamadas en GUIAS_PUBLICADAS");
        assert.match(fila, /ruta:\s*"\/crm\/llamadas"/);
        const tarjeta = /tarjeta:\s*"([^"]+)"/.exec(fila)?.[1] ?? "";
        assert.match(tarjeta, /^Aprende a [^[\]]+ en la plataforma$/);
        assert.ok([...tarjeta].length <= 75, `la descripción mide ${[...tarjeta].length} caracteres`);
        assert.ok(leer("scripts/sembrar-guia-llamadas.mjs").includes(`description: "${tarjeta}"`), "la semilla dice otra descripción");
        assert.match(leer("lib/navigation-routes.ts"), /crm\/llamadas/);
    });

    test("la semilla solo usa datos de ejemplo", () => {
        const s = leer("scripts/sembrar-guia-llamadas.mjs");
        assert.doesNotMatch(s, /@gmail|verzay|ia-app\.com/i, "la semilla lleva datos que parecen reales");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "llamadas");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/llamadas/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5 && kb < 600, `${n} pesa ${kb.toFixed(1)} KB`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA y NO se indexa", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/llamadas/page.tsx", "app/guia/llamadas/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deLlamadas = [["LLAMADAS", "·"], ["Llamadas", "·"], ["llamadas", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/llamadas/${rel}`), deLlamadas), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/llamadas/${rel} no es la de Leads con otro nombre`);
        }
    });
}
