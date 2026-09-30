/**
 * Las descripciones de los tutoriales guardados a mano (tabla `GuidesUrl`,
 * Documentación › Administrador tutoriales) que no seguían la regla de las
 * tarjetas: «Aprende a [acción concreta] en la plataforma», 75 caracteres
 * como mucho (`lib/tutoriales-del-modulo.ts`).
 *
 * Es la foto de producción del 2026-09-30 y cómo quedó cada una. Se aplica con
 * `node scripts/corregir-descripciones-de-tutoriales.mjs` (con DATABASE_URL):
 * cada fila se toca SOLO si su descripción sigue siendo la de `antes`, así que
 * repetirlo no pisa lo que alguien haya retocado después.
 *
 * El banco comprueba que cada `ahora` cumple la regla y cabe en una línea de
 * la tarjeta de verdad.
 */
const AUTOMATIZACIONES = "Configura automatizaciones inteligentes en tus embudos para gestionar oportunidades.";
const AUTOMATIZACIONES_AHORA = "Aprende a automatizar tus embudos y oportunidades en la plataforma";

export const DESCRIPCIONES_DE_LOS_TUTORIALES = [
    { id: "e54ccbef-92f1-4859-97c4-50ce0e131557", antes: AUTOMATIZACIONES, ahora: AUTOMATIZACIONES_AHORA },
    { id: "92981350-dc79-4f99-a717-6f1d9d4a8660", antes: AUTOMATIZACIONES, ahora: AUTOMATIZACIONES_AHORA },
    { id: "1b131b30-130e-4e38-bd81-de686c03c55c", antes: AUTOMATIZACIONES, ahora: AUTOMATIZACIONES_AHORA },
    { id: "5f03a50d-dfc7-4aa3-973c-0ece1de0bcd3", antes: AUTOMATIZACIONES, ahora: AUTOMATIZACIONES_AHORA },
    { id: "2e50a59d-881f-4088-8449-11790ae7d494", antes: AUTOMATIZACIONES, ahora: AUTOMATIZACIONES_AHORA },
    {
        id: "e77294e2-a173-43cf-bd1e-05739db16b9f",
        antes: "Ajusta el estado del agente, tiempos de respuesta entre otros.",
        ahora: "Aprende a ajustar el estado y la respuesta de tu Agente IA en la plataforma",
    },
    {
        id: "ba02f79d-bee1-4b19-b9c9-d3c2244ea250",
        antes: "Aprende cómo entrenar tu Agente IA con IA Prompts",
        ahora: "Aprende a entrenar tu Agente IA con IA Prompts en la plataforma",
    },
    {
        id: "4f2e6eb7-d05b-4e70-a0da-13e3573af9f0",
        antes: "Aprende cómo activar y personalizar la voz de tu Agente IA",
        ahora: "Aprende a activar y personalizar la voz de tu Agente IA en la plataforma",
    },
    {
        id: "4e01aa54-7603-4db0-9f92-b6274d4cd730",
        antes: "Conoce cómo configurar respuestas con diferentes archivos multimedia",
        ahora: "Aprende a crear flujos con respuestas multimedia en la plataforma",
    },
    {
        id: "d17a00da-b2f2-47dd-b71b-5ca63a8ad8de",
        antes: "Aprende paso a paso cómo entrenar y configurar tu Agente IA",
        ahora: "Aprende a entrenar y configurar tu Agente IA paso a paso en la plataforma",
    },
    {
        id: "be94052f-0331-4051-ad95-5d75be078526",
        antes: "Panel de Informes IA para analizar el rendimiento de tu Agente IA.",
        ahora: "Aprende a analizar el rendimiento de tu Agente IA en la plataforma",
    },
    {
        id: "3d297535-cefd-4876-9899-dadfa687f666",
        antes: "Recorrido completo del módulo de Leads con video explicativo y guias",
        ahora: "Aprende a organizar y filtrar tus contactos de WhatsApp en la plataforma",
    },
    {
        id: "e5b2ab4e-f381-48b6-90dc-823193b60a02",
        antes: "Configura seguimientos para automatizar tareas, gestionar oportunidades con tus clientes.",
        ahora: "Aprende a automatizar seguimientos con tus clientes en la plataforma",
    },
    {
        id: "851fe160-65f4-4710-a987-20369a35078f",
        antes: "Aprende a configurar el módulo de agenda y sus recordatorios",
        ahora: "Aprende a configurar tu agenda y sus recordatorios en la plataforma",
    },
    {
        id: "6ff9260a-ad58-4613-baab-b3378772cb94",
        antes: "Aprende cómo gestionar conversaciones de tus clientes y administrar todo desde un solo lugar.",
        ahora: "Aprende a gestionar las conversaciones con tus clientes en la plataforma",
    },
    {
        id: "b65b06e7-6ae6-49df-a0b9-d13e270c3278",
        antes: "Conecta los principales canales con Agente IA y gestiona la atención en una sola plataforma.",
        ahora: "Aprende a conectar tus canales con el Agente IA en la plataforma",
    },
    {
        id: "689da447-5a27-4559-bfb2-6ffbd7a0bd63",
        antes: "Aprende a crear y gestionar tus diagramas de flujo en la plataforma.",
        ahora: "Aprende a crear y gestionar tus diagramas de flujo en la plataforma",
    },
    {
        id: "7485088a-0393-4d49-bd04-d5073326445a",
        antes: "Aprende a crear y personalizar tu catálogo de productos para compartir con tus clientes.",
        ahora: "Aprende a crear y compartir tu catálogo de productos en la plataforma",
    },
];
