/**
 * Las IMÁGENES DE EJEMPLO de la guía de AI Imágenes (`/guia/ai-imagenes`): el
 * producto que se sube en las capturas y los anuncios que la pantalla
 * «genera» a partir de él.
 *
 * # Por qué existen
 *
 * La guía se fotografía sobre la App servida de verdad, y la pantalla de AI
 * Imágenes le pide las imágenes a Google (Gemini) con la API key de la cuenta.
 * En el banco no hay ninguna clave de Google —ni debe haberla: sería la de un
 * cliente—, así que durante las capturas contesta un Gemini FINGIDO
 * (`scripts/gemini-de-la-guia.mjs`) que devuelve estas imágenes. Se generan UNA
 * vez y se comitean en `scripts/guia-ai-imagenes/`, como la caché de la voz
 * Cedar: regenerar la guía no vuelve a pagar nada.
 *
 * Se generan con `gpt-image-1` (edición, con el producto como referencia para
 * que salga el MISMO en todos los anuncios) y se guardan en JPEG, con el lado
 * largo a 1080 px y recortadas a su proporción exacta (1:1, 9:16, 16:9). Son
 * datos de ejemplo: ninguna cara, ninguna marca, ningún texto dentro.
 *
 *   OPENAI_API_KEY=… node scripts/generar-ejemplos-ai-imagenes.mjs [carpeta]
 *
 * Con `CLAVE_DE="IA CRM"` lee esa llave de `verzay_api_keys` con Prisma, que es
 * como se corre dentro del contenedor de la App (allí `OPENAI_API_KEY` es de
 * relleno, y este entorno no tiene red hacia api.openai.com). Solo genera lo
 * que falte.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/** El producto, en todos los anuncios. Sin marca: la guía es pública. */
const EL_PRODUCTO =
    "a matte sage-green insulated stainless steel water bottle (750 ml) with a natural bamboo screw lid";

/** Lo que llevan todos los anuncios: el mismo producto, sin texto ni caras. */
const COMUN =
    "Photorealistic premium advertising photograph. Keep EXACTLY the same bottle as in the reference image " +
    "(same sage-green matte color, same shape, same bamboo lid). No text, no letters, no numbers, no logos, " +
    "no watermarks. No faces.";

/**
 * Cada ejemplo: el fichero, su proporción y lo que se pide. Los de `hero`
 * son la tanda normal (tres formatos y dos variantes del cuadrado); los otros
 * nueve, el kit de landing (las diez etapas, en cuadrado).
 */
export const EJEMPLOS = [
    {
        archivo: "producto.jpg",
        formato: "1:1",
        prompt:
            `Clean studio product photograph of ${EL_PRODUCTO}, standing upright and centered on a pure white ` +
            "background, soft even studio light, gentle shadow underneath. No text, no logos, no branding.",
    },
    {
        archivo: "hero-1x1-1.jpg",
        formato: "1:1",
        prompt: `${COMUN} Hero shot: the bottle standing on a polished white marble table, luxurious soft side lighting, subtle reflections, elegant and calm premium mood, generous empty space around it.`,
    },
    {
        archivo: "hero-1x1-2.jpg",
        formato: "1:1",
        prompt: `${COMUN} Hero shot from a slightly lower camera angle: the bottle on a white marble table with a few fresh water droplets on it, warm golden morning light from a window, soft bokeh background.`,
    },
    {
        archivo: "hero-9x16.jpg",
        formato: "9:16",
        prompt: `${COMUN} Vertical story composition: the bottle standing on white marble in the lower half of the frame, soft luxurious light, clean empty space in the upper part of the frame.`,
    },
    {
        archivo: "hero-16x9.jpg",
        formato: "16:9",
        prompt: `${COMUN} Wide horizontal banner: the bottle on a long white marble table placed on the right third, soft premium side lighting, calm empty space on the left.`,
    },
    {
        archivo: "pain-1x1.jpg",
        formato: "1:1",
        prompt: `${COMUN} A cluttered office desk with a crumpled, warm half-empty plastic water bottle in dull light; the sage-green bottle stands at the side in a soft beam of clean light, as the better choice.`,
    },
    {
        archivo: "solution-1x1.jpg",
        formato: "1:1",
        prompt: `${COMUN} Clean explanatory shot: the bottle on white marble with its bamboo lid unscrewed and resting next to it, bright and friendly light.`,
    },
    {
        archivo: "benefits-1x1.jpg",
        formato: "1:1",
        prompt: `${COMUN} The bottle on a rock at a sunny mountain lookout, fresh morning air, green valley in the soft background, feeling of calm and freedom.`,
    },
    {
        archivo: "social-1x1.jpg",
        formato: "1:1",
        prompt: `${COMUN} Three hands from different people each holding the same sage-green bottle together outdoors in a park, happy warm light, only hands and arms visible.`,
    },
    {
        archivo: "demo-1x1.jpg",
        formato: "1:1",
        prompt: `${COMUN} Top-down flat lay on white marble showing three simple steps in a row: the open bottle, a small bowl of ice cubes being added, and the bottle closed with its bamboo lid.`,
    },
    {
        archivo: "objections-1x1.jpg",
        formato: "1:1",
        prompt: `${COMUN} Detailed close-up of the bottle's brushed stainless steel rim and thick double wall, conveying durability and quality, dramatic studio light on marble.`,
    },
    {
        archivo: "offer-1x1.jpg",
        formato: "1:1",
        prompt: `${COMUN} Two identical sage-green bottles next to an elegant open kraft gift box with tissue paper, on white marble, festive warm light.`,
    },
    {
        archivo: "cta-1x1.jpg",
        formato: "1:1",
        prompt: `${COMUN} Bold, high-contrast shot: the bottle on a small marble pedestal under a strong spotlight, deep sage and warm gold background, energetic mood.`,
    },
    {
        archivo: "trust-1x1.jpg",
        formato: "1:1",
        prompt: `${COMUN} The bottle next to a plain recycled cardboard box and a sprig of eucalyptus on white marble, natural eco-friendly feel, soft daylight.`,
    },
];

/** El tamaño que se le pide a la IA y el recorte a la proporción exacta. */
const TAMANO = { "1:1": "1024x1024", "9:16": "1024x1536", "16:9": "1536x1024" };
const PROPORCION = { "1:1": 1, "9:16": 9 / 16, "16:9": 16 / 9 };
const LADO_LARGO = 1080;

async function laClave() {
    // Dentro del contenedor de la App la variable OPENAI_API_KEY es de relleno:
    // con `CLAVE_DE` se lee la llave por su nombre en Panel › API keys.
    if (!process.env.CLAVE_DE) {
        if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
        throw new Error("falta OPENAI_API_KEY (o CLAVE_DE con el nombre de una llave de verzay_api_keys)");
    }
    const nombre = process.env.CLAVE_DE;
    const req = createRequire(path.join(process.cwd(), "server.js"));
    const { PrismaClient } = req("@prisma/client");
    const db = new PrismaClient();
    try {
        const [fila] = await db.$queryRaw`SELECT "clave" FROM "verzay_api_keys" WHERE "nombre" = ${nombre} LIMIT 1`;
        if (!fila?.clave) throw new Error(`no hay ninguna llave «${nombre}» en verzay_api_keys`);
        return fila.clave;
    } finally {
        await db.$disconnect();
    }
}

async function pedir(clave, ejemplo, producto) {
    const cabecera = { Authorization: `Bearer ${clave}` };
    let r;
    if (!producto) {
        r = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { ...cabecera, "content-type": "application/json" },
            body: JSON.stringify({ model: "gpt-image-1", prompt: ejemplo.prompt, size: TAMANO[ejemplo.formato], quality: "medium", n: 1 }),
        });
    } else {
        const f = new FormData();
        f.append("model", "gpt-image-1");
        f.append("prompt", ejemplo.prompt);
        f.append("size", TAMANO[ejemplo.formato]);
        f.append("quality", "medium");
        f.append("image[]", new Blob([producto], { type: "image/jpeg" }), "producto.jpg");
        r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: cabecera, body: f });
    }
    const cuerpo = await r.json();
    if (!r.ok) throw new Error(`${ejemplo.archivo}: ${r.status} ${cuerpo?.error?.message ?? ""}`);
    return Buffer.from(cuerpo.data[0].b64_json, "base64");
}

/** Recorta al centro a la proporción exacta y deja el lado largo en 1080. */
async function comoJpeg(sharp, png, formato) {
    const img = sharp(png);
    const { width, height } = await img.metadata();
    const p = PROPORCION[formato];
    let w = width;
    let h = Math.round(width / p);
    if (h > height) {
        h = height;
        w = Math.round(height * p);
    }
    const left = Math.floor((width - w) / 2);
    const top = Math.floor((height - h) / 2);
    const [rw, rh] = w >= h ? [Math.min(LADO_LARGO, w), null] : [null, Math.min(LADO_LARGO, h)];
    return sharp(png)
        .extract({ left, top, width: w, height: h })
        .resize(rw, rh)
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
}

async function main() {
    const carpeta = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "guia-ai-imagenes"));
    fs.mkdirSync(carpeta, { recursive: true });
    const faltan = EJEMPLOS.filter((e) => !fs.existsSync(path.join(carpeta, e.archivo)));
    console.log(`[ejemplos] ${EJEMPLOS.length} imágenes, faltan ${faltan.length}`);
    if (!faltan.length) return;
    const sharp = createRequire(path.join(process.cwd(), "server.js"))("sharp");
    const clave = await laClave();
    for (const e of faltan) {
        const producto = e.archivo === "producto.jpg" ? null : fs.readFileSync(path.join(carpeta, "producto.jpg"));
        const png = await pedir(clave, e, producto);
        fs.writeFileSync(path.join(carpeta, e.archivo), await comoJpeg(sharp, png, e.formato));
        console.log(`[ejemplos] ${e.archivo} listo`);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((e) => {
        console.error("[ejemplos]", e.message);
        process.exit(1);
    });
}
