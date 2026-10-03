/**
 * El acceso «Compras» de Finanzas, en Chromium y sobre la página SERVIDA.
 *
 * Lo reportado: dentro de Finanzas, «Compras» abría el formulario de «Nuevo
 * gasto» —sin ningún sitio donde decir a quién se le compró— en vez de uno de
 * compra con la lista de Proveedores, como Ventas usa la de Clientes.
 *
 * Las acciones y la regla tienen su banco contra Postgres; lo que solo se ve
 * aquí es que la PANTALLA lo cumple:
 *
 *  1. «Compras» abre «Nueva compra», con el campo Proveedor, y la dirección
 *     pierde su `?create=` —con él puesto, pulsar «Compras» otra vez llevaría a
 *     la misma dirección y no abriría nada—.
 *  2. Sin proveedor no se guarda, y se dice: «Elige el proveedor».
 *  3. El selector ofrece los proveedores de la lista y se busca por nombre.
 *  4. Guardar deja la fila con su proveedor, y la referencia es SU id.
 *  5. «Compras» otra vez vuelve a abrir una compra nueva.
 *  6. Un proveedor que no está se crea desde el propio formulario y aparece en
 *     la lista de Proveedores, con su código.
 *  7. Lo que ya existía no cambió: «Nuevo» de Gastos y `?create=1` abren
 *     «Nuevo gasto», sin el campo Proveedor.
 *  8. Editar una compra la abre como compra, con su proveedor puesto.
 *
 * Hace falta: `BASE` y `DATABASE_URL`. `MODO=roto` exige que FALLE (se corre
 * con un `.next` del commit de antes): «Compras» abría «Nuevo gasto».
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE ?? "http://localhost:3934";
const USUARIO = process.env.USUARIO ?? "jefe@banco.test";
const CLAVE = process.env.CLAVE ?? "banco1234";
const ROTO = process.env.MODO === "roto";
const PLAZO_MS = 15000;
const GASTOS = `${BASE}/dashboard/finance/expenses`;

const db = new PrismaClient();
const fallos = [];
const exigir = (bien, que) => {
  if (!bien) fallos.push(que);
  console.log(`${bien ? "ok  " : "FALLO"} ${que}`);
};

async function entrar(contexto) {
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2500);
  await pagina.fill('input[name="email"]', USUARIO);
  await pagina.fill('input[name="password"]', CLAVE);
  await pagina.click('button[type="submit"]');
  for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) {
    await pagina.waitForTimeout(500);
  }
  if (pagina.url().includes("/login")) throw new Error("no se pudo entrar: sigue en /login");
  return pagina;
}

/**
 * Lo que salta solo al entrar y no es de esta prueba —la «Guía rápida», el
 * aviso de una actualización— se aparta con Escape. Se dice cuál era: una
 * ventana que no se esperaba no puede pasar callada.
 */
async function despejar(pagina) {
  await pagina.waitForTimeout(1500);
  for (let i = 0; i < 4; i += 1) {
    const titulo = await pagina.evaluate(() => {
      const d = document.querySelector('[role="dialog"], [role="alertdialog"]');
      return d ? (d.querySelector("h2")?.textContent?.trim() || "(sin título)") : null;
    });
    if (!titulo) return;
    console.log(`  (se aparta lo que saltó al entrar: «${titulo}»)`);
    await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(400);
  }
}

/** El formulario de crear o editar que está abierto, leído de lo que SE VE. */
async function elFormulario(pagina) {
  return pagina.evaluate(() => {
    const dialogos = [...document.querySelectorAll('[role="dialog"]')].filter(
      (d) => d.getBoundingClientRect().width > 0 && d.getAttribute("data-state") !== "closed",
    );
    const dialogo = dialogos.find((d) => d.querySelector("h2")) ?? dialogos[0];
    if (!dialogo) return null;
    return {
      titulo: dialogo.querySelector("h2")?.textContent?.trim() ?? "",
      modo: dialogo.getAttribute("data-formulario-de-gasto"),
      conProveedor: !!dialogo.querySelector("[data-campo-proveedor]"),
      proveedor: dialogo.querySelector('[data-campo-proveedor] [role="combobox"]')?.textContent?.trim() ?? "",
    };
  });
}

/** Espera a que se abra un formulario cuyo título sea este. */
async function esperarFormulario(pagina, titulo) {
  const hasta = Date.now() + PLAZO_MS;
  let ultimo = null;
  while (Date.now() < hasta) {
    ultimo = await elFormulario(pagina);
    if (ultimo && ultimo.titulo === titulo) return ultimo;
    await pagina.waitForTimeout(300);
  }
  return ultimo;
}

/** Espera a que se cierre todo diálogo. */
async function esperarCerrado(pagina) {
  const hasta = Date.now() + PLAZO_MS;
  while (Date.now() < hasta) {
    if (!(await elFormulario(pagina))) return true;
    await pagina.waitForTimeout(300);
  }
  return false;
}

/** Un aviso de sonner con este texto. */
async function esperarAviso(pagina, texto) {
  try {
    await pagina.locator("[data-sonner-toast]", { hasText: texto }).first().waitFor({ timeout: PLAZO_MS });
    return true;
  } catch {
    return false;
  }
}

/** Pulsa el acceso «Compras» de la fila de accesos de Finanzas. */
async function pulsarCompras(pagina) {
  const enlace = pagina.locator("a", { hasText: /^Compras$/ }).first();
  await enlace.waitFor({ timeout: PLAZO_MS });
  await enlace.click();
}

async function escribirEnElFormulario(pagina, concepto, monto) {
  const dialogo = pagina.locator('[role="dialog"]').last();
  await dialogo.locator('input[placeholder^="Ej:"]').fill(concepto);
  await dialogo.locator('input[type="number"]').first().fill(String(monto));
}

async function guardar(pagina, rotulo) {
  await pagina.locator('[role="dialog"]').last().getByRole("button", { name: rotulo }).click();
}

const navegador = await chromium.launch({
  executablePath: process.env.CHROME_BIN || undefined,
  args: ["--lang=es-CO"],
});
try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-CO" });
  const pagina = await entrar(contexto);
  await pagina.goto(GASTOS, { waitUntil: "domcontentloaded" });
  await despejar(pagina);

  const dueno = await db.user.findUnique({ where: { email: USUARIO } });
  const proveedores = await db.financeContact.findMany({
    where: { userId: dueno.id, kind: "SUPPLIER", status: "ACTIVE" },
    orderBy: { code: "asc" },
  });

  // ── 1. «Compras» abre «Nueva compra» ─────────────────────────────────────
  await pulsarCompras(pagina);
  let form = await esperarFormulario(pagina, "Nueva compra");

  if (ROTO) {
    // El «antes»: el mismo acceso abría el formulario de un gasto cualquiera.
    form = form?.titulo === "Nueva compra" ? form : await esperarFormulario(pagina, "Nuevo gasto");
    exigir(form?.titulo === "Nuevo gasto", `antes: «Compras» abría «Nuevo gasto» (abrió «${form?.titulo ?? "nada"}»)`);
    exigir(form && !form.conProveedor, "antes: el formulario no tenía ningún campo de proveedor");
  } else {
    exigir(form?.titulo === "Nueva compra", `«Compras» abre «Nueva compra» (abrió «${form?.titulo ?? "nada"}»)`);
    exigir(form?.modo === "compra", "el formulario se marca como compra");
    exigir(!!form?.conProveedor, "el formulario de compra trae el campo Proveedor");
    await pagina.waitForTimeout(600);
    exigir(!pagina.url().includes("create="), `la dirección pierde su ?create= (quedó ${pagina.url()})`);
    exigir(pagina.url().includes("month="), "y conserva el mes que se estaba mirando");

    // ── 2. Sin proveedor no se guarda ──────────────────────────────────────
    await escribirEnElFormulario(pagina, "Café verde de prueba", 350000);
    await guardar(pagina, "Guardar compra");
    exigir(await esperarAviso(pagina, "Elige el proveedor"), "sin proveedor no se guarda y se dice «Elige el proveedor»");
    exigir((await elFormulario(pagina))?.titulo === "Nueva compra", "y el formulario sigue abierto");

    // ── 3. La lista de proveedores, con su buscador ────────────────────────
    const campo = pagina.locator("[data-campo-proveedor]");
    await campo.getByRole("combobox").click();
    const opciones = pagina.locator("[cmdk-item]");
    await opciones.first().waitFor({ timeout: PLAZO_MS });
    const ofrecidos = (await opciones.allTextContents()).map((t) => t.trim());
    exigir(
      proveedores.length > 0 && proveedores.every((p) => ofrecidos.some((o) => o.startsWith(p.name))),
      `el selector ofrece los ${proveedores.length} proveedores de la lista (${ofrecidos.join(" | ")})`,
    );
    await pagina.locator("[cmdk-input]").fill("esperanza");
    await pagina.waitForTimeout(300);
    // Lo tecleado no es el nombre EXACTO de nadie, así que debajo se sigue
    // ofreciendo crearlo: eso no es un resultado, es la opción de crear.
    const filtrados = (await pagina.locator("[cmdk-item]:not([data-crear-proveedor])").allTextContents()).map((t) =>
      t.trim(),
    );
    exigir(
      filtrados.length === 1 && filtrados[0].startsWith("Finca La Esperanza"),
      `buscar «esperanza» deja solo «Finca La Esperanza» (${filtrados.join(" | ")})`,
    );
    await opciones.first().click();
    exigir(
      (await elFormulario(pagina))?.proveedor === "Finca La Esperanza",
      "el proveedor elegido se ve en el campo",
    );

    // ── 4. Guardar deja la compra con su proveedor ─────────────────────────
    await guardar(pagina, "Guardar compra");
    exigir(await esperarAviso(pagina, "Compra creada"), "guardar dice «Compra creada»");
    exigir(await esperarCerrado(pagina), "y cierra el formulario");
    const esperanza = proveedores.find((p) => p.name === "Finca La Esperanza");
    const fila = await db.financeTransaction.findFirst({
      where: { userId: dueno.id, title: "Café verde de prueba" },
      orderBy: { createdAt: "desc" },
    });
    exigir(fila?.type === "EXPENSE", "la compra se guarda como un gasto (sale en Gastos y en el balance)");
    exigir(fila?.counterparty === "Finca La Esperanza", `con su proveedor (${fila?.counterparty})`);
    exigir(
      !!esperanza && fila?.reference === `proveedor:${esperanza.id}`,
      `y la referencia es el id de ESE proveedor (${fila?.reference})`,
    );
    exigir(Number(fila?.amount) === 350000, `con su monto (${fila?.amount})`);

    // ── 5 y 6. «Compras» otra vez, y un proveedor nuevo desde el formulario ─
    await pulsarCompras(pagina);
    form = await esperarFormulario(pagina, "Nueva compra");
    exigir(form?.titulo === "Nueva compra", "«Compras» otra vez vuelve a abrir una compra nueva");
    exigir(form?.proveedor === "Selecciona un proveedor", "y llega sin proveedor elegido");

    await pagina.locator("[data-campo-proveedor]").getByRole("combobox").click();
    await pagina.locator("[cmdk-input]").fill("Molinos del Sur");
    const crear = pagina.locator("[data-crear-proveedor]");
    await crear.waitFor({ timeout: PLAZO_MS });
    exigir(
      ((await crear.textContent()) ?? "").includes("Crear «Molinos del Sur» como proveedor"),
      "lo que no está en la lista se ofrece para crear",
    );
    await crear.click();
    exigir(await esperarAviso(pagina, "Proveedor «Molinos del Sur» creado"), "se crea sin salir del formulario");
    exigir((await elFormulario(pagina))?.proveedor === "Molinos del Sur", "y queda elegido");
    const nuevo = await db.financeContact.findFirst({
      where: { userId: dueno.id, kind: "SUPPLIER", name: "Molinos del Sur" },
    });
    exigir(!!nuevo && nuevo.code === `P-${proveedores.length + 1}`, `en la lista de Proveedores, con su código (${nuevo?.code})`);

    await escribirEnElFormulario(pagina, "Molienda de prueba", 120000);
    await guardar(pagina, "Guardar compra");
    exigir(await esperarAviso(pagina, "Compra creada"), "la compra al proveedor nuevo se guarda");
    await esperarCerrado(pagina);
    const filaNueva = await db.financeTransaction.findFirst({
      where: { userId: dueno.id, title: "Molienda de prueba" },
    });
    exigir(
      filaNueva?.counterparty === "Molinos del Sur" && filaNueva?.reference === `proveedor:${nuevo?.id}`,
      "con el proveedor recién creado",
    );

    await pagina.goto(`${BASE}/dashboard/finance/providers`, { waitUntil: "domcontentloaded" });
    await pagina.locator("text=Molinos del Sur").first().waitFor({ timeout: PLAZO_MS }).catch(() => {});
    exigir(
      await pagina.locator("text=Molinos del Sur").first().isVisible(),
      "el proveedor creado desde la compra aparece en la pantalla de Proveedores",
    );

    // ── 7. Lo de siempre no cambió ────────────────────────────────────────
    await pagina.goto(GASTOS, { waitUntil: "domcontentloaded" });
    await despejar(pagina);
    await pagina.getByRole("button", { name: "Nuevo", exact: true }).first().click();
    form = await esperarFormulario(pagina, "Nuevo gasto");
    exigir(form?.titulo === "Nuevo gasto", "«Nuevo» de Gastos sigue abriendo «Nuevo gasto»");
    exigir(form && !form.conProveedor, "y sin el campo Proveedor");
    await pagina.keyboard.press("Escape");
    await esperarCerrado(pagina);

    await pagina.goto(`${GASTOS}?create=1`, { waitUntil: "domcontentloaded" });
    form = await esperarFormulario(pagina, "Nuevo gasto");
    exigir(form?.titulo === "Nuevo gasto", "un enlace viejo con ?create=1 sigue abriendo «Nuevo gasto»");
    await pagina.keyboard.press("Escape");
    await esperarCerrado(pagina);

    // ── 8. Editar una compra la abre como compra ──────────────────────────
    await pagina.goto(GASTOS, { waitUntil: "domcontentloaded" });
    await despejar(pagina);
    const laFila = pagina.locator("tr", { hasText: "Café verde de prueba" }).first();
    await laFila.waitFor({ timeout: PLAZO_MS });
    await laFila.locator('button[aria-label="Editar"]').first().click();
    form = await esperarFormulario(pagina, "Editar compra");
    exigir(form?.titulo === "Editar compra", `editar una compra abre «Editar compra» (abrió «${form?.titulo ?? "nada"}»)`);
    exigir(form?.proveedor === "Finca La Esperanza", `con su proveedor puesto (${form?.proveedor})`);
  }
} finally {
  await navegador.close();
  await db.$disconnect();
}

if (fallos.length) {
  console.error(`\n${fallos.length} fallo(s):\n - ${fallos.join("\n - ")}`);
  process.exit(1);
}
console.log(ROTO ? "\nantes: el fallo se reproduce" : "\ntodo en orden");
