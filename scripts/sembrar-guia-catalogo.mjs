/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Catálogo, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su clave y los módulos).
 *
 * Una tostadora de café inventada, con la forma de una cuenta de verdad: su
 * catálogo configurado entero —número de WhatsApp, portada, color, textos,
 * redes y el stock y el SKU a la vista— y productos que enseñan cada cosa que
 * una tarjeta sabe decir: cuatro categorías, uno con descuento, uno con pocas
 * unidades («¡Últimas!») y uno agotado («Sin stock»). Con tres tarjetas
 * iguales una guía no enseña nada.
 *
 * Y una SEGUNDA cuenta con el enlace «tienda» ya tomado: es lo que deja
 * fotografiar el aviso de «ese nombre ya está en uso».
 *
 * Las imágenes (portada, logo y fotos) viven en `https://imagenes.guia.test/`,
 * un dominio que no existe: el guion de capturas las sirve él mismo
 * (`imagenes-guia-catalogo.mjs`), así que no se sube nada a ningún sitio y la
 * guía no depende de la red.
 *
 * El marco —la cuenta de un cliente, su menú y la barra de arriba— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 */
import { PrismaClient } from "@prisma/client";

import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";
import { DOMINIO_DE_IMAGENES } from "./imagenes-guia-catalogo.mjs";

const db = new PrismaClient();

const marco = await sembrarElMarco(db, {
    path: "/mis-catalogo",
    title: "Guía de Catálogo",
    description: "Recorrido completo de la pantalla de Catálogo con video explicativo y guias",
    url: "/guia/catalogo",
});

// El nombre de la empresa sale en la barra del catálogo público: el de la
// tienda de ejemplo, con su logo.
const dueno = await db.user.update({
    where: { id: marco.id },
    data: { company: "Café del Monte", image: `${DOMINIO_DE_IMAGENES}/logo.png`, preferredCurrencyCode: "COP" },
});

const CONFIGURACION = {
    whatsappNumber: "573001234567",
    bannerUrl: `${DOMINIO_DE_IMAGENES}/portada.jpg`,
    primaryColor: "#8B4513",
    headline: "Café del Monte",
    subheadline: "Café de origen, tostado cada semana en las montañas de Colombia",
    instagram: "@cafedelmonte",
    facebook: "@cafedelmonte",
    tiktok: "@cafedelmonte",
    ctaText: "Pedir por WhatsApp",
    showStock: true,
    showSku: true,
    slug: "cafe-del-monte",
};

await db.catalogConfig.deleteMany({});
await db.catalogConfig.create({ data: { userId: dueno.id, ...CONFIGURACION } });

// La otra cuenta: su catálogo ya se llama «tienda».
const otra = await db.user.upsert({
    where: { email: "otra@guia.test" },
    update: {},
    create: { email: "otra@guia.test", name: "Otra tienda", role: "user", status: true, company: "Otra tienda" },
});
await db.catalogConfig.create({ data: { userId: otra.id, slug: "tienda" } });

// [título, categoría, precio, precio antes, stock, sku, etiquetas, descripción, imagen]
const PRODUCTOS = [
    ["Café Origen Huila 500 g", "Café en grano", 42000, null, 38, "CDM-HUI-500", ["Tostión media", "Frutal"], "Notas de panela y frutos rojos. Grano entero, tostado esta semana.", "huila"],
    ["Café Nariño Especial 500 g", "Café en grano", 48000, 56000, 22, "CDM-NAR-500", ["Tostión clara", "Floral"], "Acidez brillante y cuerpo sedoso. Cosecha de altura.", "narino"],
    ["Café Tolima Clásico 250 g", "Café en grano", 26000, null, 6, "CDM-TOL-250", ["Tostión oscura"], "Chocolate y nuez. Perfecto para espresso.", "tolima"],
    ["Café Molido para Filtro 500 g", "Café molido", 39000, null, 45, "CDM-MOL-500", ["Molienda media"], "Molido para cafetera de goteo y método V60.", "molido"],
    ["Café Molido Espresso 250 g", "Café molido", 24000, null, 0, "CDM-ESP-250", ["Molienda fina"], "Molienda fina para máquina de espresso.", "espresso"],
    ["Prensa Francesa 600 ml", "Accesorios", 89000, 99000, 12, "CDM-PRE-600", ["Vidrio", "Acero"], "Vidrio de borosilicato y filtro de acero inoxidable.", "prensa"],
    ["Molino Manual de Café", "Accesorios", 125000, null, 8, "CDM-MOL-MAN", ["Muelas cerámicas"], "Muelas cerámicas ajustables, de fino a grueso.", "molino"],
    ["Caja Regalo Degustación", "Regalos", 95000, null, 15, "CDM-REG-DEG", ["3 orígenes", "Regalo"], "Tres cafés de origen en bolsas de 150 g y una taza.", "regalo"],
];

await db.product.deleteMany({ where: { userId: { in: [dueno.id, otra.id] } } });
for (const [i, [title, category, price, comparePrice, stock, sku, tags, description, imagen]] of PRODUCTOS.entries()) {
    await db.product.create({
        data: {
            userId: dueno.id,
            title,
            category,
            price,
            comparePrice,
            stock,
            sku,
            tags,
            description,
            images: [`${DOMINIO_DE_IMAGENES}/${imagen}.png`],
            isActive: true,
            order: i,
        },
    });
}

console.log(JSON.stringify({ productos: PRODUCTOS.length, enlace: CONFIGURACION.slug, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
