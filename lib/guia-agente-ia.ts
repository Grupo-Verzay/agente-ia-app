/**
 * La GUÍA PÚBLICA de Agente IA (`/guia/agente-ia`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`):
 * una tarjeta por sección, sus pasos con capturas de la pantalla real y un
 * vídeo de un minuto narrado. Documenta la pantalla Y su editor interno: las
 * ocho pestañas del entrenamiento, cada una con su lista de bloques.
 *
 * Las listas de abajo (`CANALES_DOCUMENTADOS`, `PESTANAS_DEL_EDITOR`,
 * `ACCIONES_DE_UN_PASO`…) no son decoración: el banco las compara con lo que
 * pintan los componentes de `/ia`. Una pestaña o una acción nueva en la
 * pantalla sin su nombre aquí pone el banco en rojo, que es como se evita que
 * la guía se quede describiendo una pantalla que ya no existe.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Agente IA en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_AGENTE_IA = "Entrenamiento";

/**
 * Las seis ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Los canales",
    "La barra del editor",
    "El editor",
    "La vista previa",
] as const;

/** Los canales de entrenamiento, en su orden (`lib/channel-training.ts`). */
export const CANALES_DOCUMENTADOS = ["WhatsApp", "Llamadas", "Videollamadas", "WhatsApp API", "Telegram", "Facebook", "Instagram"] as const;

/** Las pestañas del editor, en su orden (`ai-section-labels.ts › TYPE_AI_LABELS`). */
export const PESTANAS_DEL_EDITOR = [
    "Perfil",
    "Inicio",
    "Preguntas",
    "Productos",
    "Extras",
    "Palabras clave",
    "Gestión",
    "Cotizaciones",
] as const;

/** Lo que ofrece «Agregar acción» de un bloque, grupo por grupo (`FunctionSelector.tsx`). */
export const ACCIONES_DE_UN_PASO = ["Ejecutar flujo", "Notificar asesor", "Leer Google Sheets"] as const;
export const TEXTOS_DE_UN_PASO = ["Agregar caso", "Agregar respuesta", "Agregar transición", "Agregar nota interna"] as const;

/** Los dos modos del paso de bienvenida (`TrainingBuilder.tsx`). */
export const MODOS_DE_BIENVENIDA = ["obligatoria", "inteligente"] as const;

/** Qué recoge una Captura de datos de Gestión (`types/agentAi.ts › SUBTYPE_OPTIONS`). */
export const TIPOS_DE_CAPTURA = ["Solicitudes", "Pedidos", "Reservas", "Reclamos", "Citas"] as const;

/** Lo que hace una regla de palabras clave, y cómo compara (`KeywordsBuilder.tsx`). */
export const ACCIONES_DE_UNA_REGLA = ["Responder con texto", "Escalar a asesor"] as const;
export const COINCIDENCIAS = ["Contiene", "Exacta"] as const;

/** Lo que abre el «⋯» de la barra del editor (`ai-section-labels.ts › OPCIONES_DEL_AGENTE`). */
export const OPCIONES_DEL_AGENTE = [
    "IA Prompts",
    "Voz del agente",
    "Métricas del agente",
    "Historial de versiones",
    "Eliminar todo",
] as const;

/** Los campos fijos del Perfil (`BusinessPromptBuilder.tsx`). */
export const CAMPOS_DEL_PERFIL = [
    "Nombre del Negocio",
    "Sector / Rubro",
    "Ubicación / Dirección",
    "Horarios de Atención",
    "Número de Contacto",
    "Sitio web",
] as const;

export const GUIA_AGENTE_IA: Contenido = {
    titulo: "Agente IA",
    subtitulo: "Entrena al asistente que atiende a tus clientes, paso a paso",
    descripcion:
        "Agente IA es donde le enseñas a tu asistente cómo atender. Le cuentas quién es tu negocio, qué pasos sigue " +
        "una conversación, qué preguntas responde, qué productos ofrece y cuándo pasar a una persona. Lo haces por " +
        "canal, guardas cada versión y ves en todo momento lo que el agente lee.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, los canales, la barra del editor, el editor y la vista previa.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 Los canales · 4 La barra del editor · 5 El editor · 6 La vista previa.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Agente IA con sus seis partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Agente IA está dentro de Entrenamiento. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Agente IA dentro de Entrenamiento",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "Los canales",
                    texto: "Un entrenamiento por canal: WhatsApp, Llamadas, WhatsApp API, Telegram, Facebook, Instagram y Videollamadas. El que va resaltado es el que editas.",
                    imagen: "canales.webp",
                    alt: "La fila de canales arriba del editor, con WhatsApp elegido",
                },
                {
                    titulo: "La barra del editor",
                    texto: "1 Las ocho pestañas del entrenamiento · 2 Guardar · 3 Más opciones · 4 El avance: cuántas pestañas llevas completas.",
                    imagen: "barra-del-editor.webp",
                    alt: "La barra del editor con sus partes numeradas",
                },
                {
                    titulo: "La vista previa",
                    texto: "A la derecha, el texto entero que lee tu agente, armado con todo lo que escribes. Se pone al día mientras editas.",
                    imagen: "vista-previa.webp",
                    alt: "La vista previa del prompt a la derecha del editor",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Agente IA por Entrenamiento.",
                "La vista previa se ve en pantallas anchas; en un móvil el editor ocupa todo el ancho.",
                "Pasa el cursor por una pestaña para ver qué parte de la conversación cubre.",
            ],
        },
        {
            slug: "canales",
            titulo: "Un entrenamiento por canal",
            resumen: "Cada canal tiene su propio entrenamiento, y todos parten del de WhatsApp.",
            icono: "MessageCircle",
            miniatura: "mini-canales.webp",
            pasos: [
                {
                    titulo: "WhatsApp es la base",
                    texto: "El entrenamiento de WhatsApp es el primero y siempre está disponible. Es el que atiende tu línea por QR.",
                    imagen: "canales-whatsapp.webp",
                    alt: "El canal WhatsApp elegido en la fila de canales",
                },
                {
                    titulo: "Otro canal, su propio entrenamiento",
                    texto: "Al abrir otro canal por primera vez nace como una copia del de WhatsApp. Desde ahí lo cambias sin tocar el de WhatsApp.",
                    imagen: "canales-otro.webp",
                    alt: "El canal Llamadas abierto con su propio entrenamiento",
                },
                {
                    titulo: "Un canal con candado",
                    texto: "Si un canal no está activo en tu cuenta sale con candado. Al abrirlo te dice cómo activarlo, con el botón «Ir a Conexión».",
                    imagen: "canales-bloqueado.webp",
                    alt: "El aviso Canal no habilitado con el botón Ir a Conexión",
                },
            ],
            consejos: [
                "Entrena primero WhatsApp: los demás canales parten de él.",
                "Cambiar un canal no cambia los demás: cada uno guarda sus propias versiones.",
            ],
        },
        {
            slug: "perfil",
            titulo: "El perfil del negocio",
            resumen: "Quién es tu negocio: sus datos, sus redes y la firma del agente.",
            icono: "Store",
            miniatura: "mini-perfil.webp",
            pasos: [
                {
                    titulo: "Los datos del negocio",
                    texto: "Nombre, sector, ubicación, horarios, número de contacto y sitio web. Es lo primero que lee el agente.",
                    imagen: "perfil-datos.webp",
                    alt: "La pestaña Perfil con los datos del negocio",
                },
                {
                    titulo: "Campos adicionales",
                    texto: "En «Seleccionar campos...» agregas los que necesites: correo, redes sociales o Telegram.",
                    imagen: "perfil-campos.webp",
                    alt: "El selector de campos adicionales abierto",
                },
                {
                    titulo: "Firma y notas",
                    texto: "1 La firma: el nombre con el que se presenta el agente · 2 Notas / Instrucciones extra: el tono y lo que no debe hacer.",
                    imagen: "perfil-firma.webp",
                    alt: "La firma del agente y las notas del perfil",
                },
            ],
            consejos: [
                "Escribe los horarios y la ubicación tal como quieres que los diga el agente.",
                "Lo que escribes en el Perfil sale al principio de la vista previa.",
            ],
        },
        {
            slug: "pasos",
            titulo: "Los pasos de la conversación",
            resumen: "La pestaña Inicio: la bienvenida y el orden en que avanza cada conversación.",
            icono: "GitBranch",
            miniatura: "mini-pasos.webp",
            pasos: [
                {
                    titulo: "La bienvenida",
                    texto: "El paso 1 es fijo. Eliges su modo: obligatoria, saluda siempre; inteligente, detecta primero lo que busca el cliente.",
                    imagen: "pasos-bienvenida.webp",
                    alt: "El paso de bienvenida con sus dos modos",
                },
                {
                    titulo: "Un paso",
                    texto: "Cada paso es una etapa de la conversación: su título y lo que el agente debe lograr o responder en ella.",
                    imagen: "pasos-paso.webp",
                    alt: "Un paso abierto con su título y su objetivo",
                },
                {
                    titulo: "Plantillas",
                    texto: "El botón «Plantillas» llena el paso con un modelo ya probado. Eliges uno, lo revisas a la derecha y pulsas «Aplicar».",
                    imagen: "pasos-plantillas.webp",
                    alt: "El panel de plantillas de un paso con el botón Aplicar",
                },
                {
                    titulo: "Motor de Flujo",
                    texto: "Qué datos recoge el paso y cuándo avanza al siguiente. Puedes pedir varios, separados por comas.",
                    imagen: "pasos-motor.webp",
                    alt: "El Motor de Flujo con la variable y la condición para avanzar",
                },
                {
                    titulo: "Ordenar, duplicar y eliminar",
                    texto: "1 Arrastrar para cambiar el orden · 2 Abrir o cerrar · 3 Duplicar · 4 Eliminar. «Agregar paso» suma uno al final.",
                    imagen: "pasos-mandos.webp",
                    alt: "Los mandos de un paso numerados",
                },
            ],
            consejos: [
                "Un paso por etapa: saludar, entender, ofrecer y cerrar.",
                "Con «Colapsar todo» ves la lista entera de un vistazo.",
            ],
        },
        {
            slug: "elementos",
            titulo: "Acciones y respuestas de un paso",
            resumen: "Lo que el agente hace o dice dentro de un paso: flujos, avisos, hojas y notas.",
            icono: "PlusCircle",
            miniatura: "mini-elementos.webp",
            pasos: [
                {
                    titulo: "Agregar acción",
                    texto: "Acciones: Ejecutar flujo, Notificar asesor y Leer Google Sheets. Conversación: Agregar caso, Agregar respuesta, Agregar transición y Agregar nota interna.",
                    imagen: "elementos-menu.webp",
                    alt: "El menú Agregar acción abierto con sus dos grupos",
                },
                {
                    titulo: "Ejecutar un flujo",
                    texto: "Eliges uno de tus flujos y el agente lo lanza en ese paso: un catálogo, una ubicación o un menú.",
                    imagen: "elementos-flujo.webp",
                    alt: "Un elemento Ejecutar flujo con el flujo elegido",
                },
                {
                    titulo: "Respuesta y nota interna",
                    texto: "1 La respuesta: lo que lee el cliente · 2 La nota interna, con candado: una instrucción que el agente obedece y no dice.",
                    imagen: "elementos-nota.webp",
                    alt: "Una respuesta y una nota interna dentro de un paso",
                },
            ],
            consejos: [
                "Arrastra los elementos por su asa para cambiar el orden.",
                "La nota interna va siempre al final del paso.",
            ],
        },
        {
            slug: "conocimiento",
            titulo: "Preguntas, productos y extras",
            resumen: "Lo que el agente sabe responder: tus preguntas frecuentes, tu catálogo y los casos especiales.",
            icono: "FileStack",
            miniatura: "mini-conocimiento.webp",
            pasos: [
                {
                    titulo: "Preguntas",
                    texto: "1 Una tarjeta por pregunta frecuente, con su respuesta · 2 «Agregar pregunta» suma otra.",
                    imagen: "preguntas.webp",
                    alt: "La pestaña Preguntas con sus preguntas frecuentes",
                },
                {
                    titulo: "Productos",
                    texto: "1 Una tarjeta por producto o servicio: qué es, su precio y cómo ofrecerlo · 2 «Agregar producto» suma otro.",
                    imagen: "productos.webp",
                    alt: "La pestaña Productos con sus productos",
                },
                {
                    titulo: "Extras",
                    texto: "1 Objeciones, garantías, envíos o cualquier caso especial que el agente deba saber manejar · 2 «Agregar extra» suma otro.",
                    imagen: "extras.webp",
                    alt: "La pestaña Extras con sus casos especiales",
                },
            ],
            consejos: [
                "Las tres pestañas funcionan igual que los pasos: plantillas, acciones, duplicar y eliminar.",
                "El número al lado de cada pestaña dice cuántos bloques lleva.",
            ],
        },
        {
            slug: "palabras-clave",
            titulo: "Palabras clave",
            resumen: "Respuestas exactas, sin IA, para las palabras que tus clientes escriben siempre.",
            icono: "Filter",
            miniatura: "mini-palabras-clave.webp",
            pasos: [
                {
                    titulo: "Tus reglas",
                    texto: "Cada regla intercepta el mensaje antes que la IA: si el cliente escribe esa palabra, sale esa respuesta.",
                    imagen: "palabras-clave.webp",
                    alt: "La pestaña Palabras clave con sus reglas",
                },
                {
                    titulo: "Una regla nueva",
                    texto: "1 El tipo de coincidencia: Contiene o Exacta · 2 Las palabras · 3 La respuesta exacta que sale.",
                    imagen: "palabras-clave-nueva.webp",
                    alt: "El formulario de una regla nueva",
                },
                {
                    titulo: "Escalar a asesor",
                    texto: "En vez de responder, la regla puede pasar la conversación a una persona: «Escalar a asesor».",
                    imagen: "palabras-clave-escalar.webp",
                    alt: "Una regla con la acción Escalar a asesor",
                },
            ],
            consejos: [
                "Usa Contiene para frases como «cuánto cuesta» y Exacta para palabras sueltas.",
                "Una regla se edita con «Editar» y se borra desde su «⋯».",
            ],
        },
        {
            slug: "gestion",
            titulo: "Gestión: recoger datos",
            resumen: "Qué datos pide el agente para cerrar: un pedido, una reserva, un reclamo o una cita.",
            icono: "ClipboardList",
            miniatura: "mini-gestion.webp",
            pasos: [
                {
                    titulo: "Captura de datos",
                    texto: "Cada bloque de Gestión es una captura de datos: lo que el agente pide al cliente para dejar el caso registrado.",
                    imagen: "gestion.webp",
                    alt: "La pestaña Gestión con una captura de datos",
                },
                {
                    titulo: "Qué recoge",
                    texto: "Eliges el tipo: Solicitudes, Pedidos, Reservas, Reclamos o Citas.",
                    imagen: "gestion-tipo.webp",
                    alt: "El selector del tipo de captura abierto",
                },
                {
                    titulo: "Los campos",
                    texto: "1 Escribes el dato que debe pedir: nombre, dirección, cédula · 2 Lo agregas con el botón verde.",
                    imagen: "gestion-campos.webp",
                    alt: "Los campos de una captura de datos",
                },
            ],
            consejos: [
                "Lo que el agente recoge aquí queda en el CRM, en Registros.",
                "Con el tipo Citas el agente comparte el enlace de tu agenda.",
            ],
        },
        {
            slug: "cotizaciones",
            titulo: "Cotizaciones",
            resumen: "El agente envía un PDF con tus precios del catálogo cuando el cliente pide una cotización.",
            icono: "FileText",
            miniatura: "mini-cotizaciones.webp",
            pasos: [
                {
                    titulo: "Actívalas",
                    texto: "Nacen apagadas. Con el interruptor, cuando el cliente pida una cotización el agente le envía un PDF por WhatsApp.",
                    imagen: "cotizaciones-activar.webp",
                    alt: "El interruptor de cotizaciones automáticas encendido",
                },
                {
                    titulo: "Las condiciones",
                    texto: "Lo que escribas aquí va tal cual al final de cada cotización: validez, forma de pago, envíos.",
                    imagen: "cotizaciones-condiciones.webp",
                    alt: "El campo de condiciones de la cotización",
                },
                {
                    titulo: "Nunca inventa un precio",
                    texto: "Los precios salen de tu catálogo de Productos. Lo que no está ahí, o un descuento, pasa a un asesor.",
                    imagen: "cotizaciones-catalogo.webp",
                    alt: "La explicación de cómo el agente arma la cotización",
                },
            ],
            consejos: [
                "Mantén al día tu catálogo de Productos: es de donde salen los precios.",
                "Cotizaciones no cuenta en el avance: es opcional.",
            ],
        },
        {
            slug: "guardar-y-opciones",
            titulo: "Guardar y más opciones",
            resumen: "Guardar una versión, volver a una anterior y las herramientas del «⋯».",
            icono: "History",
            miniatura: "mini-guardar-y-opciones.webp",
            pasos: [
                {
                    titulo: "Guardar",
                    texto: "En verde cuando hay cambios sin guardar; «Guardado» en gris cuando no queda nada. Cada vez que guardas nace una versión.",
                    imagen: "guardar.webp",
                    alt: "El botón Guardar en verde en la barra del editor",
                },
                {
                    titulo: "Más opciones",
                    texto: "El tamaño del prompt, IA Prompts, Voz del agente, Métricas del agente, Historial de versiones y Eliminar todo.",
                    imagen: "menu-opciones.webp",
                    alt: "El menú Más opciones del agente abierto",
                },
                {
                    titulo: "IA Prompts",
                    texto: "Un asistente que te ayuda a escribir la pestaña que tienes abierta: le pides un cambio y te propone el texto.",
                    imagen: "ia-prompts.webp",
                    alt: "La ventana IA Prompts abierta",
                },
                {
                    titulo: "Historial de versiones",
                    texto: "Todas las versiones guardadas, de la más nueva a la más vieja. Puedes restaurar cualquiera.",
                    imagen: "historial.webp",
                    alt: "El historial de versiones del entrenamiento",
                },
                {
                    titulo: "Métricas del agente",
                    texto: "Cuántas conversaciones atiende el agente, cuántas pasan a una persona y en qué estado están los leads.",
                    imagen: "metricas.webp",
                    alt: "El panel de métricas del agente",
                },
            ],
            consejos: [
                "Guarda antes de cambiar de canal: cada canal tiene su propio botón.",
                "«Eliminar todo» borra el entrenamiento entero y pide confirmación.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("agente-ia", GUIA_AGENTE_IA);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
