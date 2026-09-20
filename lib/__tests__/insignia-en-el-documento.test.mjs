/**
 * Que el número acabe en el favicon DE VERDAD, en un navegador.
 *
 * Es el fallo 3 del #838, y es el que ningún banco de funciones puras podía
 * cazar: el PNG se dibujaba bien, se metía en su `<link rel="icon">`… y la
 * pestaña seguía con el icono de siempre. La causa no estaba en el dibujo,
 * estaba en que **el documento declara varios iconos** —el layout pone tres,
 * más los que Next emite por convención— y con varios candidatos el navegador
 * elige por tamaño y por tipo, no por orden. Añadir el nuestro al final no
 * ganaba nada.
 *
 * Así que esto se comprueba como se comprobó la insignia en su día:
 * **decodificando el PNG que acaba en el `<link>`**, no mirando la pantalla.
 * Un `data:` distinto no prueba nada —podría ser el icono de siempre
 * recodificado—; lo que prueba que la insignia está es que aparezca rojo donde
 * antes no había, y en su esquina.
 *
 * # Los dos modos
 *
 * Con `MODO=viejo` el `<link>` se añade al final del `<head>` sin apartar a
 * los demás, que es como estaba. Ese modo afirma lo que se veía: quedan
 * CUATRO iconos declarados y el que el documento resuelve como «el icono» no
 * es el nuestro. Sin ese modo no se sabría si lo verde del nuevo es que se
 * arregló la causa o que el caso no llegaba a ejercerse.
 *
 * Cómo se levanta: `scripts/banco-insignia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const VIEJO = process.env.MODO === "viejo";

/**
 * El `ponerElIcono` de antes, escrito aquí.
 *
 * Creaba su `<link>` y lo ponía **al final del `<head>`**, contando con que
 * «entre dos iconos declarados manda el último». No manda el último: manda el
 * que el navegador elija entre los cuatro, y elegía el de 48.
 */
const PONER_VIEJO = `
  // Va en \`window.ponerViejo\` y NO sobrescribiendo \`window.I\`: el objeto de
  // un módulo ESM es de solo lectura, así que asignarle encima no hace nada
  // —en silencio— y el modo roto habría ejercido el código nuevo. Costó una
  // vuelta.
  window.ponerViejo = (url) => {
    let link = document.head.querySelector('link[data-insignia]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.setAttribute('data-insignia', '');
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = url;
  };
`;

/** Playwright va instalado en el sistema, no en el proyecto. */
let chromium = null;
try {
  ({ chromium } = require("playwright"));
} catch {
  // Sin navegador no se finge: se dice y se salta. Un banco que pasa sin
  // ejercer nada es peor que uno que no corre.
}

const ICONO = readFileSync(new URL("../../public/favicon-48.png", import.meta.url));
const COMPILADO = readFileSync(
  new URL("./.compilado/insignia-del-favicon.js", import.meta.url),
  "utf8",
);

/**
 * La página, con los MISMOS `<link rel="icon">` que emite el layout.
 *
 * Tres iconos con su `sizes`, más un `apple-touch-icon` que no se toca —es de
 * otro `rel`, lo usa iOS y además es el respaldo para leer el icono de base—.
 * Si esta lista deja de parecerse a la de `app/layout.tsx`, este banco deja de
 * probar el caso que importa.
 */
const PAGINA = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>banco de la insignia</title>
<link rel="icon" href="/favicon-48.png" sizes="48x48" type="image/png">
<link rel="icon" href="/favicon-48.png" sizes="192x192" type="image/png">
<link rel="icon" href="/favicon-48.png" sizes="512x512" type="image/png">
<link rel="apple-touch-icon" href="/favicon-48.png">
</head><body>
<script type="module">
  import * as I from "/insignia.js";
  window.I = I;
  window.listo = true;
</script>
</body></html>`;

function levantar() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url.startsWith("/insignia.js")) {
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end(COMPILADO);
      } else if (req.url.startsWith("/favicon-48.png")) {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(ICONO);
      } else {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PAGINA);
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** Cuántos píxeles rojos tiene el PNG, y cuántos en su esquina de abajo. */
async function rojos(page, dataUrl) {
  return page.evaluate(async (url) => {
    const img = new Image();
    await new Promise((ok, mal) => {
      img.onload = ok;
      img.onerror = mal;
      img.src = url;
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    let total = 0;
    let abajoDerecha = 0;
    for (let i = 0; i < data.length; i += 4) {
      const p = i / 4;
      const x = p % c.width;
      const y = Math.floor(p / c.width);
      const [r, v, a, op] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      const esRojo = op > 200 && r > 180 && v < 110 && a < 110;
      if (!esRojo) continue;
      total += 1;
      if (x > c.width / 2 && y > c.height / 2) abajoDerecha += 1;
    }
    return { total, abajoDerecha, lado: c.width };
  }, dataUrl);
}

/** Los `<link rel~="icon">` del `<head>`, en orden, con su marca. */
const losIconos = (page) =>
  page.evaluate(() =>
    Array.from(document.head.querySelectorAll('link[rel~="icon"]')).map((l) => ({
      href: l.getAttribute("href"),
      nuestro: l.hasAttribute("data-insignia"),
      sizes: l.getAttribute("sizes"),
    })),
  );

test("la insignia acaba en el `<link rel=icon>` del documento", async (t) => {
  if (!chromium) return t.skip("sin playwright en este equipo");

  const server = await levantar();
  const { port } = server.address();
  const navegador = await chromium.launch();
  const page = await navegador.newPage();

  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.listo === true);
    if (VIEJO) await page.evaluate(PONER_VIEJO);

    // 1. De partida el documento declara TRES iconos y ninguno es nuestro. Es
    //    la situación que hacía que el nuestro no ganara.
    const antes = await losIconos(page);
    assert.equal(antes.length, 3, "el documento declara tres iconos");
    assert.ok(antes.every((l) => !l.nuestro));

    // 2. El icono de base, sin insignia: NADA de rojo. Es la línea de partida
    //    contra la que se compara todo lo demás.
    const limpio = await rojos(page, `http://127.0.0.1:${port}/favicon-48.png`);
    assert.equal(limpio.total, 0, "el icono de siempre no tiene rojo");

    // 3. Se pinta un tres.
    const url = await page.evaluate(async (viejo) => {
      const icono = await window.I.elIconoDeLaPestana();
      if (!icono) return null;
      const dato = window.I.dibujarLaInsignia(icono, "3");
      if (dato) (viejo ? window.ponerViejo : window.I.ponerElIcono)(dato);
      return dato;
    }, VIEJO);
    assert.ok(url && url.startsWith("data:image/png"), "tiene que salir un PNG");

    // 4. **Y ahora el único icono del documento es el nuestro.** Esta es la
    //    comprobación del fallo: antes quedaban cuatro y ganaba el de 48.
    const conInsignia = await losIconos(page);
    const elQueGana = await page.evaluate(
      () => document.querySelector('link[rel~="icon"]').getAttribute("href"),
    );
    if (VIEJO) {
      assert.equal(conInsignia.length, 4, "los tres de siempre y el nuestro al final");
      assert.equal(elQueGana, "/favicon-48.png", "y el documento resolvía el de 48");
      assert.notEqual(elQueGana, url, "el PNG con el número no llegaba a la pestaña");
      return;
    }
    assert.equal(conInsignia.length, 1, "no puede quedar ningún otro favicon");
    assert.ok(conInsignia[0].nuestro);
    assert.ok(conInsignia[0].href.startsWith("data:image/png"));
    assert.equal(elQueGana, url);

    // 5. Y lleva la insignia DENTRO, decodificada: rojo donde antes no había,
    //    y en su esquina de abajo a la derecha.
    const pintado = await rojos(page, url);
    assert.ok(pintado.total > 100, `deberia haber rojo, y hay ${pintado.total}`);
    assert.ok(
      pintado.abajoDerecha > pintado.total * 0.6,
      "el rojo tiene que estar en su esquina, no repartido",
    );

    // 6. `apple-touch-icon` NO se toca: es otro `rel`, lo usa iOS y es el
    //    respaldo para leer el icono de base.
    const apple = await page.evaluate(
      () => document.head.querySelectorAll('link[rel~="apple-touch-icon"]').length,
    );
    assert.equal(apple, 1);

    // 7. Si algo vuelve a declarar un favicon —Next al navegar entre rutas—
    //    se aparta solo. Sin esto el icono se quedaría limpio a mitad de
    //    sesión y no habría forma de explicarlo.
    await page.evaluate(() => {
      const l = document.createElement("link");
      l.rel = "icon";
      l.href = "/favicon-48.png";
      document.head.appendChild(l);
    });
    await page.waitForFunction(
      () => document.head.querySelectorAll('link[rel~="icon"]').length === 1,
      null,
      { timeout: 2000 },
    );
    const trasElIntruso = await losIconos(page);
    assert.equal(trasElIntruso.length, 1);
    assert.ok(trasElIntruso[0].nuestro, "tiene que seguir mandando el nuestro");

    // 8. El número CAMBIA sin dejar dos links detrás.
    await page.evaluate(async () => {
      const icono = await window.I.elIconoDeLaPestana();
      window.I.ponerElIcono(window.I.dibujarLaInsignia(icono, "9+"));
    });
    const trasCambiar = await losIconos(page);
    assert.equal(trasCambiar.length, 1, "un `<link>`, no uno por número");
    assert.notEqual(trasCambiar[0].href, url, "y con otro dibujo dentro");

    // 9. Sin pendientes se DEVUELVE el documento tal cual estaba: los tres de
    //    siempre, con sus tamaños, y ninguno nuestro. Un cero no se pinta.
    await page.evaluate(() => window.I.quitarElIcono());
    const despues = await losIconos(page);
    assert.equal(despues.length, 4, "los tres de siempre más el intruso del 7");
    assert.ok(despues.every((l) => !l.nuestro), "no queda ninguno nuestro");
    assert.deepEqual(
      despues.slice(0, 3).map((l) => l.sizes),
      antes.map((l) => l.sizes),
      "vuelven con su `sizes`, no recreados a ojo",
    );
  } finally {
    await navegador.close();
    server.close();
  }
});
