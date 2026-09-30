/**
 * Cómo se MIDE el enfoque de una miniatura de guía, escrito una vez para las
 * dos guías (`miniaturas-guia-leads.test.mjs` y `miniaturas-guia-reuniones.test.mjs`).
 * Con la cuenta copiada en cada banco, el día que se afine una la otra mide
 * otra cosa y las dos guías dejan de ser comparables.
 *
 * Con el recuadro que el script de capturas dejó escrito (`foco`, en
 * fracciones de la imagen) devuelve:
 * - `fueraAlto`: el percentil 99,5 de luminancia LEJOS de la zona (el velo);
 * - `dentroAlto`: el percentil 99 DENTRO de la zona (lo nítido);
 * - `azules`: cuántos píxeles del borde tienen el azul del recuadro.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const percentil = (xs, p) => {
    const o = [...xs].sort((a, b) => a - b);
    return o[Math.min(o.length - 1, Math.floor(o.length * p))];
};

export async function medirLaMiniatura(buf, foco) {
    const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    const zona = { x: foco.x * w, y: foco.y * h, r: (foco.x + foco.w) * w, b: (foco.y + foco.h) * h };
    // El trazo mide lo mismo en todas (se escala con el encuadre): se deja un
    // margen generoso para no medir el halo como «fuera».
    const margen = 0.035 * w;
    const fuera = [];
    const dentro = [];
    let azules = 0;
    for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
            const i = (y * w + x) * 3;
            const enZona = x > zona.x + 3 && x < zona.r - 3 && y > zona.y + 3 && y < zona.b - 3;
            const lejos = x < zona.x - margen || x > zona.r + margen || y < zona.y - margen || y > zona.b + margen;
            if (enZona) dentro.push(lum(data, i));
            else if (lejos) fuera.push(lum(data, i));
            else {
                const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
                if (Math.abs(r - 37) < 45 && Math.abs(g - 99) < 45 && b > 190) azules += 1;
            }
        }
    }
    return {
        w,
        h,
        zona,
        fuera: fuera.length,
        fueraAlto: fuera.length ? percentil(fuera, 0.995) : null,
        dentroAlto: dentro.length ? percentil(dentro, 0.99) : null,
        azules,
    };
}
