/**
 * El banco de la GUÍA PÚBLICA de Reuniones (`/guia/reuniones`), con el mismo
 * estándar que la de Leads (`guia-leads.test.mjs`).
 *
 * Tres cosas, y las tres son de las que se rompen solas:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las pestañas, las acciones de
 *    la fila, las caducidades, los seis mandos de abajo, los botones de la
 *    cabecera de la reunión, las opciones de grabar y del fondo, y los números
 *    que la guía promete (4 personas, 2 minutos la mano, 90 días de historial,
 *    180 días de grabación) se leen del CÓDIGO: `ReunionesClient.tsx`,
 *    `SalaDeVideo.tsx` y los módulos puros. Un mando nuevo en la reunión sin su
 *    nombre en la guía pone esto en rojo, con el nombre del que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, igual que la de Leads.
 *
 * `MODO=roto` lee los ficheros de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía de Reuniones.
 *
 * Se levanta con `scripts/banco-guia-reuniones.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "24ba0b2";

const leerEn = (ref, rel) => {
    try {
        return execSync(`git show ${ref}:${rel}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return "";
    }
};
const leer = (rel) => (ROTO ? leerEn(ANTES, rel) : readFileSync(path.join(RAIZ, rel), "utf8"));

/** Todo el texto que la guía enseña, para buscar un nombre en cualquier parte. */
const todoElTexto = (guia) =>
    [
        guia.GUIA_REUNIONES.descripcion,
        ...guia.SECCIONES.flatMap((s) => [s.titulo, s.resumen, ...s.pasos.flatMap((p) => [p.titulo, p.texto, p.alt]), ...(s.consejos ?? [])]),
    ].join("\n");

/**
 * Los mandos de la cabecera de la reunión tal cual los pinta `SalaDeVideo.tsx`:
 * cada `<MandoDeCabecera …>` con TODOS los rótulos de su prop `rotulo` (los dos
 * de un ternario cuentan), más el botón de grabar, que es un menú y no un
 * `MandoDeCabecera`. Se lee del marcado, no de una lista del banco.
 */
export function losMandosDeLaCabecera(fuente) {
    const mandos = [];
    let i = 0;
    while ((i = fuente.indexOf("<MandoDeCabecera", i)) >= 0) {
        const fin = fuente.indexOf("/>", i);
        const bloque = fuente.slice(i, fin).replace(/\/\/[^\n]*\n/g, "\n");
        // Solo el valor de `rotulo`: hasta la prop siguiente.
        const desde = bloque.slice(bloque.indexOf("rotulo=") + "rotulo=".length);
        const rotulo = desde.split(/\n\s*[A-Za-z]+=/)[0];
        const cadenas = [...rotulo.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
        const plantillas = [...rotulo.matchAll(/`([^`]*)`/g)].map((m) => m[1].split("${")[0]);
        mandos.push([...cadenas, ...plantillas].map((r) => r.trim()).filter(Boolean));
        i = fin;
    }
    const grabar = /aria-label="(Grabar la reunión)"/.exec(fuente);
    if (grabar) mandos.push([grabar[1]]);
    return mandos;
}

/** La caja de los estados SIN sala (entrando, en la puerta, fuera) de `SalaDeVideo.tsx`. */
const laCentrada = (fuente) => /function Centrada\([^)]*\)[^{]*\{[\s\S]*?className="([^"]+)"/.exec(fuente)?.[1] ?? "";
/** Los estados que se pintan ANTES de la sala: de `if (arrancando)` a `return (` de la sala. */
const losEstadosSinSala = (fuente) => {
    const ini = fuente.indexOf("if (arrancando)");
    const esperando = fuente.indexOf('if (malla.estado === "esperando")', ini);
    // Un trozo vacío pasaría cualquier «no contiene»: se exige encontrarlo.
    if (ini < 0 || esperando < 0) throw new Error("no se encontraron los estados sin sala en SalaDeVideo.tsx");
    return fuente.slice(ini, esperando + 900);
};

if (ROTO) {
    test("ANTES no había guía pública de Reuniones", () => {
        assert.ok(leer("lib/guia-leads.ts").length > 0, `lib/guia-leads.ts no está en ${ANTES}: no parece el «antes» bueno`);
        assert.equal(leer("lib/guia-reuniones.ts"), "", "lib/guia-reuniones.ts ya existía en ANTES_REF");
        assert.equal(leer("app/guia/reuniones/page.tsx"), "", "la página ya existía en ANTES_REF");
        assert.ok(!leer("lib/introduccion-de-la-guia.ts").includes('"reuniones"'), "la introducción editable ya conocía Reuniones");
        assert.equal(leer("scripts/capturar-guia-reuniones.mjs"), "", "el script de capturas ya existía");
    });

    test("ANTES la espera en la puerta salía casi negro sobre casi negro", () => {
        const sala = leer("components/video/SalaDeVideo.tsx");
        assert.ok(sala.includes("function Centrada"), "no se encontró `Centrada` en el «antes»");
        assert.doesNotMatch(laCentrada(sala), /bg-zinc-950/, "la caja de la espera ya tenía su fondo oscuro");
        assert.match(losEstadosSinSala(sala), /text-muted-foreground/, "la espera ya no usaba el color de texto de la plataforma");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-reuniones/guia-reuniones.mjs"));
    const sala = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-reuniones/sala-de-video.mjs"));
    const cifras = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-reuniones/cifras.mjs"));
    const texto = todoElTexto(guia);
    const cliente = leer("app/(root)/reuniones/_components/ReunionesClient.tsx");
    const salaTsx = leer("components/video/SalaDeVideo.tsx");

    test("las pestañas documentadas son EXACTAMENTE las de la barra", () => {
        const enLaBarra = [...cliente.matchAll(/<PastillaDeFiltro\s+etiqueta="([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual([...guia.PESTANAS_DOCUMENTADAS], enLaBarra, "la guía y la barra no nombran las mismas pestañas, en el mismo orden");
        const partes = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "vista-general.webp").texto;
        for (const p of enLaBarra) assert.ok(partes.includes(p), `«Las partes de la pantalla» no nombra la pestaña «${p}»`);
        const titulos = guia.SECCIONES.flatMap((s) => [s.titulo, ...s.pasos.map((x) => x.titulo)]).join("\n").toLowerCase();
        for (const p of enLaBarra) assert.ok(titulos.includes(p.toLowerCase()), `la pestaña «${p}» no tiene una sección o un paso que la enseñe`);
    });

    test("las caducidades documentadas son las de `DURACIONES`, en su orden", () => {
        const enElCodigo = sala.DURACIONES.map((d) => d.rotulo);
        assert.deepEqual([...guia.CADUCIDADES_DOCUMENTADAS], enElCodigo);
        const paso = guia.laSeccion("abrir-una-reunion").pasos[0].texto;
        for (const c of enElCodigo) assert.ok(paso.includes(c), `el paso de la caducidad no nombra «${c}»`);
        // «No caduca» solo la ve quien administra: la guía lo dice.
        assert.ok(sala.DURACIONES.find((d) => d.rotulo === "No caduca").soloQuienManda);
        assert.match(texto, /«No caduca» solo la ve quien administra/);
    });

    test("las acciones de una reunión abierta son las de su fila", () => {
        const fila = cliente.slice(cliente.indexOf("function FilaViva"), cliente.indexOf("function FilaPasada"));
        assert.ok(fila.length > 100, "no se encontró `FilaViva` en ReunionesClient.tsx");
        for (const a of guia.ACCIONES_DE_LA_FILA) {
            assert.ok(new RegExp(`(>\\s*|"|\\n\\s*)${a}(\\s*<|"|\\s*\\n)`).test(fila), `la fila ya no tiene «${a}»`);
            // El texto o el de la captura: «Copiar enlace» es un icono, y la
            // captura lo numera con su nombre.
            assert.ok(guia.laSeccion("reuniones-abiertas").pasos.some((p) => p.texto.includes(a) || p.alt.includes(a)), `«Las reuniones abiertas» no nombra «${a}»`);
        }
        // Y ninguna acción de la fila se queda sin documentar.
        const items = [...fila.matchAll(/<DropdownMenu(?:Sub)?(?:Item|Trigger)[^>]*>[\s\S]*?\n\s*([A-ZÁÉÍÓÚ][^<>{}\n]+?)\s*\n\s*<\/DropdownMenu/g)].map((m) => m[1].trim());
        for (const it of items) assert.ok(guia.ACCIONES_DE_LA_FILA.includes(it), `la fila tiene «${it}» y la guía no lo documenta`);
    });

    test("los seis mandos de abajo son los de la barra, en su orden", () => {
        const ini = salaTsx.indexOf('rotuloEncendido="Silenciar el micrófono"');
        const barra = salaTsx.slice(salaTsx.lastIndexOf("<Mando", ini), salaTsx.indexOf('aria-label="Salir de la reunión"', ini) + 60);
        const mandos = (barra.match(/<Mando\b/g) ?? []).length + (barra.match(/<ElFondo\b/g) ?? []).length + (barra.match(/aria-label="Salir de la reunión"/g) ?? []).length;
        assert.equal(mandos, guia.MANDOS_DE_ABAJO.length, `la barra de abajo tiene ${mandos} mandos y la guía documenta ${guia.MANDOS_DE_ABAJO.length}`);
        // El orden es el de la barra. El fondo es un componente aparte
        // (`ElFondo`), así que en la barra se le busca por su etiqueta y su
        // rótulo, dentro de su propio componente.
        let desde = 0;
        for (const m of guia.MANDOS_DE_ABAJO) {
            assert.ok(salaTsx.includes(`"${m.rotulo}"`), `el mando «${m.nombre}» (${m.rotulo}) ya no está en SalaDeVideo.tsx`);
            const i = barra.indexOf(m.nombre === "Fondo" ? "<ElFondo" : `"${m.rotulo}"`, desde);
            assert.ok(i >= 0, `el mando «${m.nombre}» no va en ese orden en la barra`);
            desde = i;
        }
        const paso = guia.laSeccion("mandos").pasos[0].texto.toLowerCase();
        for (const m of guia.MANDOS_DE_ABAJO) {
            const clave = { Micrófono: "micrófono", Cámara: "cámara", "Compartir la pantalla": "compartir la pantalla", "Levantar la mano": "levantar la mano", Fondo: "fondo", Salir: "salir" }[m.nombre];
            assert.ok(paso.includes(clave), `«Los mandos de abajo» no nombra «${m.nombre}»`);
        }
    });

    test("cada botón de la cabecera de la reunión está documentado, y ninguno sobra", () => {
        const mandos = losMandosDeLaCabecera(salaTsx);
        assert.ok(mandos.length >= 8, `no se leyeron los mandos de la cabecera: ${JSON.stringify(mandos)}`);
        const documentados = guia.MANDOS_DE_LA_CABECERA.map((m) => m.rotulo);
        // «Parar la grabación» es el otro estado del de grabar, no otro mando.
        const sinParar = mandos.filter((r) => !r.every((x) => x.startsWith("Parar la grabación")));
        for (const rotulos of sinParar) {
            assert.ok(rotulos.some((r) => documentados.includes(r)), `la cabecera tiene un botón (${rotulos.join(" / ")}) que la guía no documenta`);
        }
        for (const r of documentados) assert.ok(sinParar.some((x) => x.includes(r)), `la guía documenta «${r}» y la cabecera ya no lo tiene`);
        assert.equal(documentados.length, sinParar.length, "la guía y la cabecera no tienen el mismo número de botones");
        const paso = guia.laSeccion("vista-de-la-sala").pasos[0].texto;
        for (const clave of ["recuadros", "chat", "ruido", "copiar el enlace", "grabar", "tamaño de la ventana"]) {
            assert.ok(paso.includes(clave), `«Los botones de arriba» no nombra «${clave}»`);
        }
    });

    test("las opciones de grabar y del fondo son las de sus menús", () => {
        for (const o of guia.OPCIONES_DE_GRABAR) assert.ok(salaTsx.includes(`>${o}<`), `el menú de grabar ya no ofrece «${o}»`);
        for (const o of guia.OPCIONES_DE_FONDO) assert.ok(new RegExp(`\\n\\s*${o.replace("…", "…")}\\s*\\n`).test(salaTsx), `el menú del fondo ya no ofrece «${o}»`);
        const fondo = guia.laSeccion("mandos").pasos.find((p) => p.imagen === "mandos-fondo.webp");
        for (const o of guia.OPCIONES_DE_FONDO) assert.ok(fondo.alt.includes(o.replace("…", "")), `el texto de la captura del fondo no nombra «${o}»`);
        const grabar = guia.laSeccion("grabar").pasos[0].texto.toLowerCase();
        assert.ok(grabar.includes("video y audio") && grabar.includes("solo el audio"), "«Elige qué grabar» no nombra las dos formas");
    });

    test("los números que promete la guía son los del código", () => {
        assert.equal(sala.TOPE_DE_LA_SALA, 4);
        assert.match(texto, /hasta cuatro personas/);
        assert.match(texto, /hasta 4 personas/);
        assert.equal(sala.VIGENCIA_DE_LA_MANO_MS, 2 * 60_000);
        assert.match(texto, /a los dos minutos/);
        assert.equal(cifras.DIAS_DE_HISTORICO, 90);
        assert.match(texto, /últimos 90 días/);
        assert.equal(cifras.DIAS_DE_GRABACION, 180);
        assert.match(texto, /180 días/);
    });

    test("la reunión está donde la guía dice, en el menú de un cliente", async () => {
        const { MENU_DE_UN_CLIENTE } = await import(path.join(RAIZ, "scripts/menu-de-un-cliente.mjs"));
        const modulo = MENU_DE_UN_CLIENTE.find((m) => (m.items ?? []).some((it) => it.url === "/reuniones"));
        assert.ok(modulo, "ningún módulo del menú de un cliente lleva /reuniones");
        assert.equal(modulo.label, guia.MODULO_DE_REUNIONES);
        assert.equal(modulo.items.find((it) => it.url === "/reuniones").title.trim(), guia.OPCION_DE_REUNIONES);
        const donde = guia.laSeccion("vista-general").pasos[0].texto;
        assert.ok(donde.includes(guia.MODULO_DE_REUNIONES) && donde.includes(`«${guia.OPCION_DE_REUNIONES}»`), "«Dónde está» no dice el módulo y la opción");
        const menu = JSON.parse(readFileSync(path.join(RAIZ, "scripts/menu-guia-reuniones.json"), "utf8"));
        assert.ok(menu.modulos.every((m) => m.conIcono), "el menú capturado tiene módulos sin icono (letras recortadas)");
    });

    test("la guía cubre las nueve partes de la pantalla, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "abrir-una-reunion", "reuniones-abiertas", "mandos", "vista-de-la-sala", "invitados", "chat-y-gente", "grabar", "pasadas"]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/reuniones/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("pasadas").siguiente, null);
        assert.equal(guia.lasVecinas("grabar").siguiente.slug, "pasadas");
    });

    test("cada paso es corto: la captura explica, el texto pone nombre", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            assert.ok(s.miniatura?.startsWith("mini-"), `${s.slug}: sin miniatura propia`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "reuniones");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/reuniones/${n}`);
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

    test("tiene su introducción editable y su «Contáctanos» con el nombre del módulo", () => {
        const intro = leer("lib/introduccion-de-la-guia.ts");
        assert.match(intro, /MODULOS_CON_GUIA = \[[^\]]*"reuniones"/);
        assert.match(intro, /reuniones: "Reuniones"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /reuniones:\s*\{\s*titulo: GUIA_REUNIONES\.titulo/);
        assert.match(leer("app/(root)/documentation/guide/page.tsx"), /MODULOS_CON_GUIA\.map/, "el editor de introducciones no recorre todas las guías");
    });

    test("es PÚBLICA y NO se indexa, como la de Leads", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/, "el middleware no deja pasar /guia/ sin sesión");
        const cfg = leer("next.config.js");
        assert.match(cfg.slice(cfg.indexOf('"/guia/:path*"')).slice(0, 300), /X-Robots-Tag[^\n]*noindex/);
        for (const f of ["app/guia/reuniones/page.tsx", "app/guia/reuniones/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const indice = leer("app/guia/reuniones/page.tsx");
        const lecturas = [...indice.matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
        assert.match(indice, /FinDeLaGuia/, "el índice tiene que terminar en la línea divisoria");
        assert.match(indice, /CONTENEDOR_DEL_INDICE/);
    });

    test("la espera en la puerta se lee: fondo y texto de la sala, no los de la plataforma", () => {
        // Lo cazó la captura del invitado: en su pestaña el fondo es
        // `bg-zinc-950` y «Esperando a que te dejen entrar» salía en el color de
        // texto de la plataforma, casi negro sobre casi negro.
        const clase = laCentrada(salaTsx);
        assert.match(clase, /\bbg-zinc-950\b/, "la caja de la espera no lleva el fondo de la sala");
        assert.match(clase, /\btext-zinc-100\b/, "la caja de la espera no lleva el color de texto de la sala");
        assert.doesNotMatch(losEstadosSinSala(salaTsx), /text-muted-foreground/, "un estado sin sala usa el gris de la plataforma: sobre el fondo oscuro no se lee");
    });

    test("las dos guías son SIMÉTRICAS: las mismas piezas en las mismas páginas", () => {
        const piezas = (f) => [...leer(f).matchAll(/<([A-Z][A-Za-z]+)\b/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i).sort();
        assert.deepEqual(piezas("app/guia/reuniones/page.tsx"), piezas("app/guia/leads/page.tsx"), "el índice de Reuniones no usa las mismas piezas que el de Leads");
        assert.deepEqual(piezas("app/guia/reuniones/[seccion]/page.tsx"), piezas("app/guia/leads/[seccion]/page.tsx"), "la página de sección no usa las mismas piezas");
    });
}
