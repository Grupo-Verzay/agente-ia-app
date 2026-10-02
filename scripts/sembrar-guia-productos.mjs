/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Productos, encima del
 * marco de todas las guías (`sembrar-marco-de-la-guia.mjs`: la cuenta de un
 * cliente, su menú y la barra de arriba).
 *
 * La misma tostadora de café inventada de la guía de Catálogo —para que las
 * dos guías enseñen la misma tienda—, con productos que enseñan cada cosa que
 * la tabla y el formulario saben decir: tres categorías, uno rebajado, uno
 * agotado (stock en rojo), uno con inventario sin límite, uno inactivo y uno
 * con sus cuatro fotos. Y un tope de productos en el plan, para que se vea el
 * contador «9/20».
 *
 * Las fotos viven en `https://imagenes.guia.test/`, un dominio que no existe:
 * el guion las sirve él mismo (`imagenes-guia-catalogo.mjs`).
 */
import { PrismaClient } from "@prisma/client";

import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";
import { DOMINIO_DE_IMAGENES } from "./imagenes-guia-catalogo.mjs";

const db = new PrismaClient();

const marco = await sembrarElMarco(db, {
    path: "/products",
    title: "Guía de Productos",
    description: "Aprende a crear y organizar tus productos en la plataforma",
    url: "/guia/productos",
});

const TOPE_DEL_PLAN = 20;

const dueno = await db.user.update({
    where: { id: marco.id },
    data: {
        company: "Café del Monte",
        image: `${DOMINIO_DE_IMAGENES}/logo.png`,
        preferredCurrencyCode: "COP",
        productLimit: TOPE_DEL_PLAN,
    },
});

// El catálogo público configurado, para que «Ver catálogo» enseñe la tienda.
await db.catalogConfig.deleteMany({});
await db.catalogConfig.create({
    data: {
        userId: dueno.id,
        whatsappNumber: "573001234567",
        bannerUrl: `${DOMINIO_DE_IMAGENES}/portada.jpg`,
        primaryColor: "#8B4513",
        headline: "Café del Monte",
        subheadline: "Café de origen, tostado cada semana en las montañas de Colombia",
        ctaText: "Pedir por WhatsApp",
        showStock: true,
        showSku: false,
        slug: "cafe-del-monte",
    },
});

const foto = (n) => `${DOMINIO_DE_IMAGENES}/${n}.png`;

// [título, categoría, precio, precio antes, stock, sku, etiquetas, descripción, fotos, activo]
const PRODUCTOS = [
    ["Café Origen Huila 500 g", "Café de origen", 42000, null, 38, "CDM-HUI-500", ["frutal"], "Notas de panela y frutos rojos. Grano entero, tostado esta semana.", ["huila", "narino", "tolima", "molido"], true],
    ["Café Nariño Especial 500 g", "Café de origen", 48000, 56000, 22, "CDM-NAR-500", ["oferta"], "Acidez brillante y cuerpo sedoso. Cosecha de altura.", ["narino"], true],
    ["Café Tolima Clásico 250 g", "Café de origen", 26000, null, 6, "CDM-TOL-250", [], "Chocolate y nuez. Perfecto para espresso.", ["tolima"], true],
    ["Café Molido para Filtro 500 g", "Café molido", 39000, null, 45, "CDM-MOL-500", [], "Molido para cafetera de goteo y método V60.", ["molido"], true],
    ["Café Molido Espresso 250 g", "Café molido", 24000, null, 0, "CDM-ESP-250", [], "Molienda fina para máquina de espresso.", ["espresso"], true],
    ["Prensa Francesa 600 ml", "Accesorios", 89000, 99000, 12, "CDM-PRE-600", ["oferta"], "Vidrio de borosilicato y filtro de acero inoxidable.", ["prensa"], true],
    ["Molino Manual de Café", "Accesorios", 125000, null, -1, "CDM-MOL-MAN", [], "Muelas cerámicas ajustables, de fino a grueso.", ["molino"], true],
    ["Caja Regalo Degustación", "Accesorios", 95000, null, 15, "CDM-REG-DEG", ["regalo"], "Tres cafés de origen en bolsas de 150 g y una taza.", ["regalo"], false],
];

await db.product.deleteMany({ where: { userId: dueno.id } });
for (const [i, [title, category, price, comparePrice, stock, sku, tags, description, fotos, isActive]] of PRODUCTOS.entries()) {
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
            images: fotos.map(foto),
            isActive,
            order: i,
        },
    });
}

console.log(JSON.stringify({ productos: PRODUCTOS.length, tope: TOPE_DEL_PLAN, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
