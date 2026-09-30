/**
 * El banco de la GUÍA PÚBLICA de Copiloto (`/guia/copiloto`).
 *
 * Las mismas cosas que las guías de Leads y de Mis notas, y por el mismo
 * motivo —se rompen solas—, con una más que es propia de esta pantalla: tiene
 * DOS dueños.
 *
 * 1. **Lo de la plataforma dice lo que la pantalla pinta.** Los dos botones
 *    («Fijar en Chats» y «Pantalla completa»), el nombre de la pestaña que se
 *    fija en Chats y dónde vive Copiloto en el menú salen de `lib/copiloto.ts`,
 *    que es de donde los pinta `MainCopiloto.tsx`.
 * 2. **Lo del copiloto dice lo que el copiloto enseña.** Sus rótulos no son
 *    nuestros (LibreChat v0.8.7): el script de capturas guarda lo que VIO en
 *    `scripts/copiloto-guia-librechat.json`, y cada rótulo que la guía nombra
 *    tiene que estar ahí. Si el copiloto se actualiza y un botón cambia de
 *    nombre, esto se pone en rojo con el nombre del que falta.
 * 3. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 4. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 5. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * `MODO=roto` lee los ficheros de `ANTES_COPILOTO_REF` —pinchado a un commit,
 * nunca `origin/main`— y afirma que no había guía de Copiloto.
 *
 * Se levanta con `scripts/banco-guia-copiloto.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_COPILOTO_REF ?? "ab6b110";

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

if (ROTO) {
    test("ANTES no había guía pública de Copiloto", () => {
        assert.equal(leer("lib/guia-copiloto.ts"), "", "lib/guia-copiloto.ts ya existía en ANTES_COPILOTO_REF");
        assert.equal(leer("app/guia/copiloto/page.tsx"), "", "la página ya existía en ANTES_COPILOTO_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_COPILOTO_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/["']copiloto["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía de Copiloto");
        assert.ok(!leer("lib/tutoriales-del-modulo.ts").includes("/copiloto"), "«Ver tutoriales» de /copiloto ya tenía su tarjeta");
        assert.equal(leer("scripts/copiloto-guia-librechat.json"), "", "ya se guardaba lo que enseña el copiloto");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-copiloto/guia-copiloto.mjs"));
    const vistos = JSON.parse(readFileSync(path.join(RAIZ, "scripts/copiloto-guia-librechat.json"), "utf8"));
    const todo = guia.SECCIONES.flatMap((s) => [s.resumen, ...s.pasos.map((p) => p.texto), ...(s.consejos ?? [])]).join(" \n ");

    test("lo de la PLATAFORMA sale de lib/copiloto.ts, lo mismo que pinta la pantalla", () => {
        const { fijar, quitar, pantallaCompleta } = guia.BOTONES_DE_LA_PLATAFORMA;
        const botones = guia.laSeccion("fijar-en-chats").pasos;
        assert.ok(botones.find((p) => p.imagen === "botones.webp").texto.startsWith(`1 ${fijar.rotulo}: `), "los dos botones no numeran «Fijar en Chats» primero");
        assert.ok(botones.find((p) => p.imagen === "botones.webp").texto.includes(`2 ${pantallaCompleta.titulo}`));
        assert.ok(botones.find((p) => p.imagen === "fijado.webp").texto.includes(`«${quitar.rotulo}»`), "la guía no dice en qué pasa el botón al fijar");
        const pestana = /export const NOMBRE_DE_LA_PESTANA = "([^"]+)"/.exec(leer("lib/copiloto.ts"))[1];
        assert.ok(botones.find((p) => p.imagen === "en-chats.webp").texto.includes(`«${pestana}»`), `la guía no llama a la pestaña de Chats «${pestana}»`);
        // Y dónde vive Copiloto en el menú.
        assert.ok(guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "menu-lateral.webp").texto.includes(guia.MODULO_DE_COPILOTO));
        // Lo de los dos tamaños lo cuenta un consejo: tiene que decir lo mismo que la regla.
        assert.match(todo, /En un teléfono los dos botones van en su propia fila/);
        assert.match(leer("lib/copiloto.ts"), /\| menos de 35 rem \| en su propia fila, ENCIMA del copiloto/);
    });

    test("cada rótulo del copiloto que la guía nombra estaba en la pantalla del copiloto", () => {
        assert.equal(vistos.copiloto, "LibreChat v0.8.7", "lo guardado no es del copiloto de producción");
        assert.match(leer("scripts/copiloto-de-la-guia.sh"), /IMAGEN_LIBRECHAT="librechat\/librechat:v0\.8\.7"/, "las capturas no se tomaron con la versión de producción");
        const rotulos = new Set(vistos.rotulos);
        const etiquetas = [
            ...guia.PANEL_DEL_COPILOTO.map((m) => m.etiqueta),
            ...guia.BOTONES_DE_LA_CAJA.map((m) => m.etiqueta),
            ...guia.BOTONES_DE_LA_RESPUESTA.map((m) => m.etiqueta),
            ...guia.OPCIONES_DEL_CLIP.map((m) => m.etiqueta),
            ...guia.MENU_DE_LA_CONVERSACION,
            ...guia.PROVEEDORES_DEL_SELECTOR,
            ...guia.MENU_DE_LA_CUENTA,
            ...guia.PESTANAS_DE_CONFIGURACION,
        ];
        const faltan = etiquetas.filter((e) => !rotulos.has(e));
        assert.deepEqual(faltan, [], "rótulos que la guía nombra y el copiloto no enseñó (¿se actualizó?)");
        // Lo guardado es lo que se LEE: sin el texto escondido para lectores de
        // pantalla pegado al rótulo («OpenAIseleccionado»).
        assert.deepEqual(vistos.rotulos.filter((r) => /seleccionado$/.test(r)), [], "lo guardado lleva pegado el texto oculto de un lector de pantalla");
    });

    test("cada lista numerada de la guía lleva sus mandos en su orden", () => {
        const texto = (slug, imagen) => guia.laSeccion(slug).pasos.find((p) => p.imagen === imagen).texto;
        guia.ZONAS_DE_LA_PANTALLA.forEach((z, i) => assert.ok(texto("vista-general", "vista-general.webp").includes(`${i + 1} ${z}`), `la vista general no numera «${z}» como ${i + 1}`));
        guia.PANEL_DEL_COPILOTO.forEach((m, i) => assert.ok(texto("vista-general", "panel.webp").includes(`${i + 1} ${m.nombre}`)));
        guia.BOTONES_DE_LA_CAJA.forEach((m, i) => assert.ok(texto("vista-general", "caja.webp").includes(`${i + 1} ${m.nombre}`)));
        guia.BOTONES_DE_LA_RESPUESTA.forEach((m, i) => assert.ok(texto("respuestas", "botones-de-la-respuesta.webp").includes(`${i + 1} ${m.nombre}`)));
        for (const x of [...guia.MENU_DE_LA_CONVERSACION, ...guia.PROVEEDORES_DEL_SELECTOR, ...guia.MENU_DE_LA_CUENTA, ...guia.PESTANAS_DE_CONFIGURACION, ...guia.OPCIONES_DEL_CLIP.map((o) => o.etiqueta)]) {
            assert.ok(todo.includes(`«${x}»`), `ningún paso de la guía nombra «${x}»`);
        }
    });

    test("la guía cubre la pantalla entera, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "primera-vez", "preguntar", "respuestas", "conversaciones", "modelos", "archivos", "fijar-en-chats", "cuenta"]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/copiloto/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("cuenta").siguiente, null);
        assert.equal(guia.lasVecinas("preguntar").anterior.slug, "primera-vez");
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"copiloto"/);
        // Y la tarjeta de «Ver tutoriales» de /copiloto se registra sola.
        const tutoriales = leer("lib/tutoriales-del-modulo.ts");
        assert.match(tutoriales, /GUIA_COPILOTO/);
        assert.match(tutoriales, /"\/copiloto"/);
        assert.match(tutoriales, /Aprende a redactar mensajes y resolver dudas con IA en la plataforma/);
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
        const dir = path.join(RAIZ, "public", "guia", "copiloto");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/copiloto/${n}`);
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
        for (const f of ["app/guia/copiloto/page.tsx", "app/guia/copiloto/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/copiloto/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deCopiloto = [["COPILOTO", "·"], ["Copiloto", "·"], ["copiloto", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/copiloto/${rel}`), deCopiloto),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/copiloto/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
