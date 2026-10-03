/**
 * El banco de la GUÍA PÚBLICA de Follow-ups IA (`/guia/follow-ups`).
 *
 * Las mismas cuatro cosas que las demás guías, y por el mismo motivo —se
 * rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las pestañas, los pasos de los
 *    dos asistentes, los tipos de registro, los campos de la regla de un estado,
 *    los botones de abajo y el tope de la biblioteca que documenta
 *    `lib/guia-follow-ups.ts` se leen del código (`follow-ups-de-la-pantalla`,
 *    los tres asistentes, `crm-ai-prompt-rules`, `crm-follow-up-media`).
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * `MODO=roto` lee `ANTES_FU_REF` —pinchado a un commit, nunca `origin/main`— y
 * afirma que no había guía, ni marcas en la pantalla con las que una receta
 * pudiera señalar sus partes.
 *
 * Se levanta con `scripts/banco-guia-follow-ups.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_FU_REF ?? "400482e";

const R = "app/(root)/crm/rules/components";
const SEGUIMIENTOS = `${R}/CrmFollowUpWizard.tsx`;
const SINTETIZADOR = `${R}/CrmLeadFunnelPromptWizard.tsx`;
const CLASIFICACION = `${R}/CrmLeadStatusPromptWizard.tsx`;
const BIBLIOTECA = `${R}/CrmFollowUpMediaLibrary.tsx`;
const FLUJO = `${R}/LeadStatusWorkflowPanel.tsx`;

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

const dondeEsta = (fuente, zona) => fuente.indexOf(`data-zona="${zona}"`);

if (ROTO) {
    test("ANTES no había guía pública de Follow-ups IA", () => {
        assert.equal(leer("lib/guia-follow-ups.ts"), "", "lib/guia-follow-ups.ts ya existía en ANTES_FU_REF");
        assert.equal(leer("app/guia/follow-ups/page.tsx"), "", "la página ya existía en ANTES_FU_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_FU_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/"follow-ups"/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/"\/crm\/rules"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
        for (const [fichero, zona] of [[SEGUIMIENTOS, "regla"], [SEGUIMIENTOS, "espera"], [BIBLIOTECA, "biblioteca"], [FLUJO, "flujo"], [SINTETIZADOR, "rol"]]) {
            assert.equal(dondeEsta(leer(fichero), zona), -1, `la pantalla ya tenía «data-zona="${zona}"»`);
        }
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-follow-ups/guia-follow-ups.mjs"));
    // Sin tildes ni mayúsculas: «Frío» en la guía es «Frio» en el código.
    const plano = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const textoDeLaGuia = plano(guia.SECCIONES.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n "));
    const todo = { includes: (x) => textoDeLaGuia.includes(plano(x)) };

    test("las tres pestañas son las de la pantalla, en su orden", () => {
        const fuente = leer("lib/follow-ups-de-la-pantalla.ts");
        const enLaPantalla = [...fuente.matchAll(/\{ valor: "\w+", nombre: "([^"]+)" \}/g)].map((m) => m[1]);
        assert.deepEqual([...guia.PESTANAS_DOCUMENTADAS], enLaPantalla);
        assert.match(leer(`${R}/CrmFollowUpRulesPanel.tsx`), /elNombreDeLaPestana\("leadFunnel"\)/, "las pestañas ya no toman su nombre de follow-ups-de-la-pantalla");
        for (const p of guia.PESTANAS_DOCUMENTADAS) assert.ok(todo.includes(p), `ningún paso nombra la pestaña «${p}»`);
    });

    test("los cuatro pasos de cada asistente son los del código", () => {
        const pasos = (rel) => [...leer(rel).matchAll(/^\s*title: "([^"]+)",/gm)].map((m) => m[1]).slice(0, 4);
        assert.deepEqual([...guia.PASOS_DEL_SINTETIZADOR], pasos(SINTETIZADOR));
        assert.deepEqual([...guia.PASOS_DE_LA_CLASIFICACION], pasos(CLASIFICACION));
        for (const p of [...guia.PASOS_DEL_SINTETIZADOR, ...guia.PASOS_DE_LA_CLASIFICACION]) assert.ok(todo.includes(p), `ningún paso nombra «${p}»`);
    });

    test("los tipos de registro son los de `CRM_PROMPT_RECORD_TYPES`", () => {
        const reglas = leer("lib/crm-ai-prompt-rules.ts");
        const bloque = reglas.slice(reglas.indexOf("CRM_PROMPT_RECORD_TYPES = ["), reglas.indexOf("] as const", reglas.indexOf("CRM_PROMPT_RECORD_TYPES = [")));
        assert.deepEqual([...guia.TIPOS_DEL_SINTETIZADOR], [...bloque.matchAll(/"(\w+)"/g)].map((m) => m[1]));
    });

    test("los campos de la regla de un estado: los de la pantalla, en su orden, y cada uno con su marca", () => {
        const fuente = leer("lib/follow-ups-de-la-pantalla.ts");
        const campos = [...fuente.matchAll(/\{ nombre: "([^"]+)", zona: "(\w+)" \}/g)].map((m) => ({ nombre: m[1], zona: m[2] }));
        assert.deepEqual([...guia.CAMPOS_DOCUMENTADOS], campos.map((c) => c.nombre));
        const asistente = leer(SEGUIMIENTOS);
        const posiciones = campos.map((c) => dondeEsta(asistente, c.zona));
        posiciones.forEach((pos, i) => assert.ok(pos >= 0, `la regla no tiene «data-zona="${campos[i].zona}"»`));
        assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, "los campos no se pintan en el orden que dice la guía");
        for (const c of guia.CAMPOS_DOCUMENTADOS) assert.ok(todo.includes(c), `ningún paso nombra el campo «${c}»`);
    });

    test("los botones de abajo y los estados son los del asistente de Follow-ups", () => {
        const asistente = leer(SEGUIMIENTOS);
        const pie = asistente.slice(dondeEsta(asistente, "pie"));
        const pos = guia.BOTONES_DE_ABAJO.map((b) => pie.indexOf(b));
        pos.forEach((p, i) => assert.ok(p >= 0, `el pie no tiene «${guia.BOTONES_DE_ABAJO[i]}»`));
        assert.deepEqual([...pos].sort((a, b) => a - b), pos);
        for (const e of ["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"]) assert.match(leer("lib/crm-follow-up-rules.ts") + asistente, new RegExp(e));
        for (const e of guia.ESTADOS_DOCUMENTADOS) assert.ok(todo.includes(e), `ningún paso nombra el estado «${e}»`);
    });

    test("la biblioteca y el flujo: el tope y las marcas son los del código", () => {
        assert.match(leer("lib/crm-follow-up-media.ts"), new RegExp(`MAX_MEDIA_PER_STATUS = ${guia.ARCHIVOS_POR_ESTADO};`));
        for (const z of ["biblioteca", "agregar-archivo", "archivos"]) assert.ok(dondeEsta(leer(BIBLIOTECA), z) >= 0, `la biblioteca no tiene «${z}»`);
        assert.ok(dondeEsta(leer(FLUJO), "flujo") >= 0);
        assert.match(leer(FLUJO), /aria-label="Quitar flujo"/);
        // El flujo va ENCIMA del botón de la biblioteca: la guía lo dice así.
        const asistente = leer(SEGUIMIENTOS);
        assert.ok(asistente.indexOf("<LeadStatusWorkflowPanel") < dondeEsta(asistente, "abrir-biblioteca"), "el flujo ya no va encima de la biblioteca");
    });

    test("la guía cubre todos los apartados, y cada sección tiene su página y su miniatura", () => {
        assert.deepEqual(guia.SECCIONES.map((s) => s.slug), [
            "vista-general",
            "sintetizador",
            "clasificacion",
            "follow-ups-por-estado",
            "tiempos-e-intentos",
            "horario",
            "mensajes",
            "biblioteca",
            "flujo-por-estado",
            "resumen-y-guardar",
        ]);
        const pagina = leer("app/guia/follow-ups/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("resumen-y-guardar").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"follow-ups"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /"follow-ups":/);
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

    test("la tarjeta de «Tutoriales del módulo» sale sola en /crm/rules, con su título y su descripción", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{[^{}]*modulo:\s*"follow-ups"[^{}]*\}/.exec(t)?.[0] ?? "";
        assert.ok(fila, "no hay fila de follow-ups en GUIAS_PUBLICADAS");
        assert.match(fila, /ruta:\s*"\/crm\/rules"/);
        const tarjeta = /tarjeta:\s*"([^"]+)"/.exec(fila)?.[1] ?? "";
        assert.match(tarjeta, /^Aprende a [^[\]]+ en la plataforma$/);
        assert.ok([...tarjeta].length <= 75, `la descripción mide ${[...tarjeta].length} caracteres`);
        assert.ok(leer("scripts/sembrar-guia-follow-ups.mjs").includes(`description: "${tarjeta}"`), "la semilla dice otra descripción");
        assert.match(leer("lib/navigation-routes.ts"), /"\/crm\/rules"/);
    });

    test("los datos de ejemplo no son de nadie, y las capturas no cambian nada", () => {
        const semilla = leer("scripts/sembrar-guia-follow-ups.mjs");
        assert.doesNotMatch(semilla, /@(gmail|hotmail|outlook|yahoo)\./);
        assert.match(semilla, /archivos\.ejemplo\.co/);
        const receta = leer("scripts/capturar-guia-follow-ups.mjs");
        assert.doesNotMatch(receta, /name: "Guardar en biblioteca" \}\)\.click/, "las capturas suben un archivo");
        assert.doesNotMatch(receta, /getByRole\("option"/, "las capturas eligen un flujo");
        assert.match(receta, /elBoton\(p, "Resetear cambios"\)\.click\(\)/, "lo escrito para encender Guardar no se deshace");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "follow-ups");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/follow-ups/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5, `${n} pesa ${kb.toFixed(1)} KB: no parece una captura`);
            assert.ok(kb < 600, `${n} pesa ${kb.toFixed(0)} KB`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA y NO se indexa, y no toca la base más que la de Leads", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/follow-ups/page.tsx", "app/guia/follow-ups/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deFollowUps = [["FOLLOW_UPS", "·"], ["FollowUps", "·"], ["follow-ups", "·"], ["Follow-ups IA", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/follow-ups/${rel}`), deFollowUps),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/follow-ups/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
