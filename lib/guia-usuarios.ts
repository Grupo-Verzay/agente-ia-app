/**
 * La GUÍA PÚBLICA de Usuarios (`/guia/usuarios`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`):
 * una tarjeta por sección, sus pasos con capturas de la pantalla real y un
 * vídeo de un minuto narrado.
 *
 * Las listas de abajo (`PARTES_DE_LA_BARRA_DE_TRABAJO`, `COLUMNAS_DE_LA_TABLA`,
 * `MENU_DEL_ASESOR`…) no son decoración: el banco las compara con lo que
 * pintan los componentes de `/equipo`. Un mando nuevo en la pantalla sin su
 * nombre aquí pone el banco en rojo, que es como se evita que la guía se quede
 * describiendo una pantalla que ya no existe.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Usuarios en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_USUARIOS = "Entrenamiento";

/**
 * Las cinco ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La tabla del equipo",
    "Las gráficas",
] as const;

/**
 * Los mandos de la BARRA DE TRABAJO, de izquierda a derecha, con la marca que
 * los encuentra en `team-client.tsx`.
 */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    { nombre: "Auto-asignación", marca: "data-auto-asignacion" },
    { nombre: "Tabla o Pipeline", marca: 'data-grupo="vista"' },
    { nombre: "Asignar sin atender", marca: 'data-accion="asignar-sin-atender"' },
    { nombre: "Nuevo", marca: "BotonDeCrear" },
    { nombre: "Más acciones", marca: "AccionesMasivas" },
] as const;

/** Los tres modos de la auto-asignación, con el rótulo de su botón (`MODOS`). */
export const MODOS_DE_REPARTO = ["Máx. chats", "Ilimitado", "Por porcentaje"] as const;

/**
 * Las columnas de la tabla, en su orden. «Porcentaje» solo sale con el modo
 * Por porcentaje puesto.
 */
export const COLUMNAS_DE_LA_TABLA = [
    "Asesor",
    "Rol",
    "Disponible",
    "Porcentaje",
    "Activas",
    "Cerradas",
    "Calientes",
    "Convertidas",
    "Última actividad",
    "Acciones",
] as const;

/** Los dos papeles dentro del equipo (el desplegable de la columna Rol). */
export const ROLES_DEL_EQUIPO = ["Agente", "Administrador"] as const;

/** Los campos de «Nuevo asesor», en su orden. */
export const CAMPOS_DEL_NUEVO_ASESOR = ["Nombre", "Email", "Contraseña", "Rol"] as const;

/**
 * El menú «⋯» de cada fila, en su orden. «Clientes asignados» solo sale si la
 * cuenta tiene clientes que repartir, y «Mover a otra cuenta» solo si hay otra
 * cuenta a la que mover.
 */
export const MENU_DEL_ASESOR = [
    "Módulos",
    "Permisos",
    "Clientes asignados",
    "Editar asesor",
    "Mover a otra cuenta",
    "Devolver leads a Sin asignar",
    "Eliminar",
] as const;

/**
 * El «⋯» del final de la barra. «Vincular existente» sale a quien administra
 * la cuenta (un cliente vincula sus propias cuentas con la contraseña de la
 * cuenta a vincular), y «Reiniciar vínculos» solo al administrador de la
 * plataforma.
 */
export const MAS_ACCIONES = ["Vincular existente", "Exportar CSV", "Reiniciar vínculos"] as const;

/** Las tres gráficas de debajo de la tabla, con su título (`TeamCharts.tsx`). */
export const GRAFICAS_DEL_EQUIPO = ["Carga del equipo", "Rendimiento", "Estado de leads"] as const;

export const GUIA_USUARIOS: Contenido = {
    titulo: "Usuarios",
    subtitulo: "Tu equipo, quién atiende qué y cómo se reparten los chats",
    descripcion:
        "Usuarios es donde armas tu equipo. Creas a cada persona con su rol, decides quién recibe chats y cómo se " +
        "reparten solos, ves cuánto lleva cada uno y eliges qué partes de la plataforma puede ver.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo, la tabla del equipo y las gráficas.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo · 4 La tabla del equipo, una persona por fila · 5 Las gráficas.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Usuarios con sus cinco partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Usuarios está dentro de Entrenamiento. Al entrar a una pantalla " +
                        "el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Usuarios dentro de Entrenamiento",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto:
                        "1 Auto-asignación y su modo · 2 Tabla o Pipeline · 3 Asignar sin atender · " +
                        "4 Nuevo, para crear a una persona · 5 Más acciones.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada mando numerado",
                },
                {
                    titulo: "La tabla del equipo",
                    texto:
                        "Una fila por persona: su rol, si está disponible, cuántas conversaciones lleva y, al final, " +
                        "el «⋯» con todo lo que se le puede hacer.",
                    imagen: "tabla.webp",
                    alt: "La tabla del equipo con sus columnas",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Usuarios por Entrenamiento.",
                "Esta pantalla la ven el dueño de la cuenta y sus administradores. Un agente no la ve: él trabaja desde Chats.",
                "Las gráficas del equipo van debajo de la tabla: baja un poco para verlas.",
            ],
        },
        {
            slug: "crear-usuario",
            titulo: "Crear un usuario",
            resumen: "Nombre, correo, contraseña y rol: con eso la persona ya puede entrar.",
            icono: "UserPlus",
            miniatura: "mini-crear-usuario.webp",
            pasos: [
                {
                    titulo: "Nuevo",
                    texto: "Pulsa Nuevo, en la barra de trabajo, y se abre la ventana para crear a la persona.",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nuevo resaltado en la barra de trabajo",
                },
                {
                    titulo: "Sus datos",
                    texto:
                        "Escribe su nombre, su correo y una contraseña de al menos 6 caracteres. Con ese correo y esa " +
                        "contraseña entra a la plataforma.",
                    imagen: "crear-formulario.webp",
                    alt: "La ventana Nuevo asesor con sus campos numerados",
                },
                {
                    titulo: "El rol",
                    texto:
                        "Agente: solo ve las conversaciones que le asignan. Administrador: las ve todas y maneja esta " +
                        "pantalla contigo.",
                    imagen: "crear-rol.webp",
                    alt: "El desplegable de rol abierto, con Agente y Administrador",
                },
                {
                    titulo: "Listo",
                    texto:
                        "Pulsa Crear asesor. La persona sale en la tabla, disponible y lista para recibir conversaciones.",
                    imagen: "crear-listo.webp",
                    alt: "La persona recién creada resaltada en la tabla",
                },
            ],
            consejos: [
                "Pásale a la persona su correo y su contraseña para que entre; la contraseña se cambia después en Editar asesor.",
                "Si dudas del rol, empieza por Agente: siempre puedes cambiarlo desde la tabla.",
            ],
        },
        {
            slug: "rol-y-disponibilidad",
            titulo: "Rol y disponibilidad",
            resumen: "Cambiar el papel de alguien y decir si está recibiendo chats.",
            icono: "ToggleRight",
            miniatura: "mini-rol-y-disponibilidad.webp",
            pasos: [
                {
                    titulo: "Cambiar el rol",
                    texto: "En la columna Rol eliges Agente o Administrador. El cambio se guarda al momento.",
                    imagen: "rol.webp",
                    alt: "El desplegable de la columna Rol abierto",
                },
                {
                    titulo: "Disponible",
                    texto:
                        "Apagado, el reparto automático no le da chats nuevos. Las conversaciones que ya tiene siguen " +
                        "siendo suyas.",
                    imagen: "disponible.webp",
                    alt: "La columna Disponible resaltada, con una persona apagada",
                },
                {
                    titulo: "El punto de color",
                    texto: "El punto sobre sus iniciales lo dice de un vistazo: verde, disponible; gris, no disponible.",
                    imagen: "disponible-punto.webp",
                    alt: "Las iniciales de dos personas, una con el punto verde y otra con el gris",
                },
            ],
            consejos: [
                "Cuando alguien sale de turno o se va de vacaciones, apaga Disponible: no hace falta borrarlo.",
                "Un administrador también puede recibir chats; su rol solo cambia lo que ve.",
            ],
        },
        {
            slug: "auto-asignacion",
            titulo: "Repartir los chats solos",
            resumen: "La auto-asignación y sus tres modos: Máx. chats, Ilimitado y Por porcentaje.",
            icono: "SlidersHorizontal",
            miniatura: "mini-auto-asignacion.webp",
            pasos: [
                {
                    titulo: "Encender la auto-asignación",
                    texto:
                        "Enciende Auto-asignación y cada chat nuevo va solo a una persona disponible del equipo. La " +
                        "barra se pone verde a la izquierda.",
                    imagen: "auto-encender.webp",
                    alt: "El interruptor de Auto-asignación encendido",
                },
                {
                    titulo: "Los tres modos",
                    texto:
                        "Máx. chats: nadie pasa de un tope. Ilimitado: sin tope. Por porcentaje: cada persona recibe la " +
                        "parte que le das.",
                    imagen: "auto-modos.webp",
                    alt: "Los tres modos de reparto numerados",
                },
                {
                    titulo: "El tope",
                    texto:
                        "Con Máx. chats escribes el número. Debajo de cada nombre, una barra dice cuántas lleva de ese " +
                        "tope: verde, ámbar o roja.",
                    imagen: "auto-maximo.webp",
                    alt: "El tope de chats y la barra de carga debajo de cada nombre",
                },
            ],
            consejos: [
                "Al encenderla o cambiar de modo, lo que ya estaba sin asesor se reparte en ese momento, y un aviso dice cuántas.",
                "Apagada, los chats nuevos quedan sin asignar hasta que alguien los tome o los repartas con Asignar sin atender.",
                "El reparto se turna: cada chat va a quien lleva más tiempo sin recibir uno.",
            ],
        },
        {
            slug: "por-porcentaje",
            titulo: "Repartir por porcentaje",
            resumen: "Darle a cada persona su parte de los chats, y que la cuenta cuadre sola.",
            icono: "Percent",
            miniatura: "mini-por-porcentaje.webp",
            pasos: [
                {
                    titulo: "Elegir el modo",
                    texto: "Pulsa Por porcentaje y aparece la columna Porcentaje en la tabla.",
                    imagen: "porcentaje-modo.webp",
                    alt: "El modo Por porcentaje elegido y la columna Porcentaje resaltada",
                },
                {
                    titulo: "Poner la parte de cada uno",
                    texto:
                        "Escribe el porcentaje de cada persona. Debajo sale cuántos chats ha recibido y qué parte le ha " +
                        "tocado de verdad.",
                    imagen: "porcentaje-campos.webp",
                    alt: "Los campos de porcentaje de cada persona",
                },
                {
                    titulo: "Que sumen 100",
                    texto:
                        "Los porcentajes de la gente disponible tienen que sumar 100. La barra lo dice en verde, o en " +
                        "rojo si falta o sobra.",
                    imagen: "porcentaje-suma.webp",
                    alt: "La suma de los porcentajes en la barra de trabajo",
                },
            ],
            consejos: [
                "El reparto no es al azar: nadie se aleja más de un chat de la parte que le diste.",
                "Quien no está disponible se salta y conserva su cuenta: al volver, se pone al día.",
            ],
        },
        {
            slug: "medir-al-equipo",
            titulo: "Medir al equipo",
            resumen: "Qué dice cada columna de la tabla y las tres gráficas de abajo.",
            icono: "BarChart3",
            miniatura: "mini-medir-al-equipo.webp",
            pasos: [
                {
                    titulo: "Las columnas",
                    texto:
                        "1 Activas: abiertas · 2 Cerradas · 3 Calientes · 4 Convertidas: finalizadas · 5 Última actividad. " +
                        "La barrita compara con el resto del equipo.",
                    imagen: "tabla-columnas.webp",
                    alt: "Las columnas de la tabla numeradas",
                },
                {
                    titulo: "Carga del equipo",
                    texto: "Cuántas conversaciones activas tiene cada persona frente a todas las que tiene asignadas.",
                    imagen: "grafica-carga.webp",
                    alt: "La gráfica Carga del equipo",
                },
                {
                    titulo: "Rendimiento",
                    texto: "Cerradas, calientes y convertidas de cada persona, una al lado de otra.",
                    imagen: "grafica-rendimiento.webp",
                    alt: "La gráfica Rendimiento",
                },
                {
                    titulo: "Estado de leads",
                    texto: "Cómo están clasificados los leads de la cuenta: frío, tibio, caliente, finalizado o descartado.",
                    imagen: "grafica-estado.webp",
                    alt: "La gráfica Estado de leads",
                },
            ],
            consejos: [
                "Solo cuentan las conversaciones de esta cuenta, aunque la persona atienda también en otra.",
                "Convertidas son los leads marcados como Finalizado.",
            ],
        },
        {
            slug: "pipeline",
            titulo: "El Pipeline del equipo",
            resumen: "Los contactos en columnas, una por persona, para repartir arrastrando.",
            icono: "LayoutGrid",
            miniatura: "mini-pipeline.webp",
            pasos: [
                {
                    titulo: "Una columna por persona",
                    texto: "Pulsa Pipeline: los contactos se ordenan en una columna por persona, con Sin asignar al principio.",
                    imagen: "pipeline.webp",
                    alt: "El Pipeline con una columna por persona",
                },
                {
                    titulo: "Arrastrar para reasignar",
                    texto: "Arrastra una tarjeta a otra columna y ese contacto pasa a esa persona.",
                    imagen: "pipeline-arrastrar.webp",
                    alt: "Una tarjeta arrastrándose de Sin asignar a la columna de una persona",
                },
                {
                    titulo: "Buscar un contacto",
                    texto: "Busca por nombre o por número, con o sin tildes. Al lado, cuántos coinciden del total.",
                    imagen: "pipeline-buscar.webp",
                    alt: "El buscador del Pipeline con una búsqueda escrita",
                },
                {
                    titulo: "Automatizaciones",
                    texto:
                        "La rueda de cada columna configura qué pasa cuando un contacto le llega a esa persona: una " +
                        "etiqueta, una tarea, un mensaje…",
                    imagen: "pipeline-automatizaciones.webp",
                    alt: "El panel de automatizaciones de una columna",
                },
            ],
            consejos: [
                "El Pipeline y la tabla son dos formas de ver el mismo equipo: cambias entre ellas con Tabla y Pipeline.",
                "Las automatizaciones también corren cuando el reparto automático asigna un chat.",
            ],
        },
        {
            slug: "que-ve-cada-usuario",
            titulo: "Qué ve cada usuario",
            resumen: "Módulos y permisos: el menú y los apartados que ve cada persona.",
            icono: "ShieldCheck",
            miniatura: "mini-que-ve-cada-usuario.webp",
            pasos: [
                {
                    titulo: "El menú de la persona",
                    texto: "El «⋯» al final de cada fila tiene todo lo que se le puede hacer a esa persona.",
                    imagen: "menu-del-asesor.webp",
                    alt: "El menú «⋯» de una persona abierto",
                },
                {
                    titulo: "Módulos",
                    texto: "Enciende o apaga los módulos de su menú. Arriba, Todos y Ninguno los cambian de una vez.",
                    imagen: "modulos.webp",
                    alt: "La ventana Módulos de una persona",
                },
                {
                    titulo: "Permisos",
                    texto:
                        "Apartado por apartado, lo que ve, y si puede tomar chats sin asignar. Lo que apagas no lo abre " +
                        "ni por la dirección directa.",
                    imagen: "permisos.webp",
                    alt: "La ventana Permisos de una persona",
                },
            ],
            consejos: [
                "Clientes asignados, en el mismo menú, solo sale si tu cuenta tiene clientes que repartir.",
                "Un administrador ve todas las conversaciones; un agente, solo las suyas y, si le dejas, las sin asignar.",
            ],
        },
        {
            slug: "editar-y-quitar",
            titulo: "Editar, devolver y eliminar",
            resumen: "Cambiar sus datos, soltar sus conversaciones o quitarlo del equipo.",
            icono: "PenLine",
            miniatura: "mini-editar-y-quitar.webp",
            pasos: [
                {
                    titulo: "Editar asesor",
                    texto:
                        "Cambia su nombre, su correo, su contraseña o su rol. La contraseña vacía no se cambia.",
                    imagen: "editar.webp",
                    alt: "La ventana Editar asesor",
                },
                {
                    titulo: "Otra persona en el puesto",
                    texto:
                        "Si cambias el correo porque entra otra persona, deja marcada la casilla: sus chats directos del " +
                        "equipo empiezan de cero.",
                    imagen: "editar-nuevo-ocupante.webp",
                    alt: "La casilla Entra otra persona en este puesto marcada",
                },
                {
                    titulo: "Devolver leads a Sin asignar",
                    texto:
                        "Deja sin asesor todas sus conversaciones de esta cuenta, listas para repartir otra vez. No borra " +
                        "nada.",
                    imagen: "devolver.webp",
                    alt: "La confirmación de Devolver los leads a Sin asignar",
                },
                {
                    titulo: "Eliminar",
                    texto: "Borra la cuenta de esa persona. Pide confirmación y no se puede deshacer.",
                    imagen: "eliminar.webp",
                    alt: "La confirmación de Eliminar asesor",
                },
            ],
            consejos: [
                "Si alguien se va por un tiempo, apaga Disponible en vez de eliminarlo.",
                "Mover a otra cuenta solo sale si tu empresa tiene otra cuenta a la que moverlo.",
            ],
        },
        {
            slug: "asignar-y-mas",
            titulo: "Asignar sin atender y más acciones",
            resumen: "Repartir de una vez lo que está sin asesor, y el «⋯» del final de la barra.",
            icono: "MoreHorizontal",
            miniatura: "mini-asignar-y-mas.webp",
            pasos: [
                {
                    titulo: "Asignar sin atender",
                    texto:
                        "Reparte de una vez todas las conversaciones abiertas sin asesor entre la gente disponible, con el " +
                        "modo que elegiste.",
                    imagen: "asignar-boton.webp",
                    alt: "El botón Asignar sin atender resaltado",
                },
                {
                    titulo: "El resultado",
                    texto: "Un aviso dice cuántas se asignaron. Si no quedaba ninguna, también lo dice.",
                    imagen: "asignar-resultado.webp",
                    alt: "El aviso con cuántas conversaciones se asignaron",
                },
                {
                    titulo: "Más acciones",
                    texto:
                        "El «⋯» del final: Exportar CSV descarga el equipo con sus números, para abrirlo en Excel o " +
                        "Google Sheets.",
                    imagen: "mas-acciones.webp",
                    alt: "El menú de más acciones abierto",
                },
            ],
            consejos: [
                "Asignar sin atender funciona aunque la auto-asignación esté apagada.",
                "Con Vincular existente juntas tus otras cuentas bajo esta: escribe el correo y la contraseña de la cuenta que quieres vincular.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("usuarios", GUIA_USUARIOS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
