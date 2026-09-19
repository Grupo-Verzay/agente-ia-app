// Banco de las guardas de permisos de las acciones de servidor.
//
// # Qué prueba, y por qué es el banco que hacía falta
//
// El fallo de esta familia **no es que la guarda esté mal escrita** —eso ya lo
// prueba el banco de `lib/cuenta-de-la-accion.ts`—: es que **a una hermana se
// le pasa**. Ha ocurrido literalmente así media docena de veces en este
// repositorio: `updateTagAction` y `getSessionTagsAction` al lado de seis
// hermanas guardadas, `getCatalogConfig` al lado de las suyas, `assignSessionToAdvisor`
// en Chats, los tres hermanos del estado del lead, «anclar» y «archivar»
// cuando «borrar» ya pasaba su línea.
//
// Así que esto no mira lo que la guarda hace: mira **que esté**. Recorre los
// ficheros que este lote cerró y comprueba que cada acción exportada llama a
// una de las puertas conocidas, o está en la lista de exclusiones **con su
// motivo escrito al lado**.
//
// Una exclusión sin motivo no se puede añadir: la lista es un mapa de
// `acción -> por qué`, y el banco falla si el motivo está vacío.
//
// Se ejecuta con: node --test lib/__tests__/guardas-de-las-acciones.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Las puertas que cuentan como guarda.
 *
 * `assertUserCanUseApp` entra porque **por dentro llama a
 * `assertCanAccessTargetUser`** y le añade el candado de pago encima: es la
 * misma comprobación, más otra. Dejarla fuera es lo que hizo que el barrido
 * automático marcara siete acciones de `registro-action.ts` como abiertas
 * cuando llevaban años cerradas.
 */
const PUERTAS = [
    "laCuentaDeLaAccion",
    "exigirLaCuentaDeLaAccion",
    "assertCanAccessTargetUser",
    "assertUserCanUseApp",
    "ensureUser", // userAiconfig: su `ensureUser` ES la puerta desde este lote
    "puedeEscribirManuales",
    "laCuentaDelDisparador",
    "laCuentaDeLaRespuesta",
    "laCuentaDelPrompt",
    "laCuentaDelPeriodo",
    "laCuentaDeLaCita",
    "laCuentaDeLaConversacion",
    "laCuentaDelRecordatorio",
    "laCuentaDelEquipo",
    "laCuentaDelMiembro",
    "laCuentaDelServicio",
    "laCuentaDeLaReserva",
    "laCuentaDeLaEtiqueta",
    "alcanzoLaRespuesta",
    "alcanzoElSeguimiento",
    "alcanzoLaLinea",
    // Puertas que ya existían en sus ficheros y que este lote respeta tal cual.
    "getEffectiveUserId",
];

/** Los ficheros que este lote cerró. Si se añade una acción aquí, va guardada. */
const FICHEROS = [
    "actions/ai-suggested-reply-action.ts",
    "actions/appointments-actions.ts",
    "actions/booking-form-actions.ts",
    "actions/booking-questions-actions.ts",
    "actions/bookings-actions.ts",
    "actions/catalog-config-actions.ts",
    "actions/contact-fields-actions.ts",
    "actions/crm-follow-up-media-actions.ts",
    "actions/evo-url-action.ts",
    "actions/finance-contact-fields-actions.ts",
    "actions/google-calendar-actions.ts",
    "actions/intent-trigger-actions.ts",
    "actions/manual-actions.ts",
    "actions/n8n-chat-historial-action.ts",
    "actions/prompt-actions.ts",
    "actions/reminders-actions.ts",
    "actions/rr-actions.ts",
    "actions/seguimientos-actions.ts",
    "actions/service-action.ts",
    "actions/tag-actions.ts",
    "actions/tools-action.ts",
    "actions/user-nav-preference-actions.ts",
    "actions/userAiconfig-actions.ts",
    "actions/userAvailability-actions.ts",
];

/**
 * Lo que se queda SIN guarda, y por qué.
 *
 * **El tercer cubo**: la consigna de este lote hablaba de crons, webhooks y del
 * despachador, y hay una clase más que no nombra —las acciones que abre una
 * página o una ruta **sin sesión**—. Ponerles la guarda no las protege: las
 * apaga, porque ahí no hay nadie a quien preguntarle. Es exactamente lo que
 * este repositorio ya dice de `getPublicCatalog`.
 */
const SIN_GUARDA = {
    // — Páginas y rutas públicas (no hay sesión que comprobar) —
    createAppointment:
        "la abren /schedule/[userId] y /api/schedule/appointment, que el middleware deja sin sesión",
    getRemindersByUserId:
        "la abre /schedule/[userId], pública: de ahí salen los recordatorios isSchedule del formulario",
    getPublicTeamData: "la abre la página de reservas, donde quien elige hora no es de la cuenta",
    getAvailableBookingSlots:
        "el flujo de reserva lo recorre quien no es de la cuenta: pedir las horas libres es el paso previo",
    createBookingAppointment:
        "quien reserva no tiene por qué alcanzar la cuenta; lo que acota es el equipo y el servicio elegidos",
    sendBookingNotifications: "igual, y además solo manda avisos de la reserva recién creada",
    getActiveBookingQuestions: "la abre la página pública de reservas para pintar su formulario",
    getActiveServiceBookingQuestions:
        "son las preguntas por servicio que pinta el formulario público de reservas, sin sesión",
    saveBookingFormResponse: "es el ENVÍO del formulario público de reserva: quien lo llena no tiene cuenta",
    getUserIdBySlug: "resuelve /c/<slug> para el catálogo público, que se abre sin sesión",

    // — Ya tienen SU propia puerta, y es la correcta para lo que hacen —
    updateCatalogConfig: "no recibe cuenta: resuelve currentUser() y escribe sobre su effectiveId",
    updateCatalogSlug: "igual, y además comprueba que el slug no sea de otra cuenta",
    saveContactFieldsConfig: "lleva su propia comprobación, incluida la rama de linked_accounts del equipo",

    // — Ayudantes internos: los llama una acción que ya comprobó quién llama —
    getServiceAccountEmail: "no recibe cuenta: dice con qué correo firma el calendario de la plataforma",
    syncAppointmentToCalendar: "la llama createAppointment con la cita recién creada, no el navegador",
    updateAppointmentCalendarEvent: "la llama updateAppointmentDetails, que ya comprobó la cita",
    deleteCalendarEvent: "la llaman updateAppointmentStatus y deleteAppointment, ya comprobadas",

    // — No reciben ninguna cuenta: no hay id que comprobar —
    listAiProvidersWithModels: "catálogo de la plataforma, sin cuenta dentro",
    listAiModels: "catálogo de modelos de la plataforma: no lleva ninguna cuenta dentro",
    getAiProvider: "catálogo de proveedores de la plataforma: no lleva ninguna cuenta dentro",
    getManuals: "sí comprueba, pero con currentUser() a secas: Manual no tiene dueño",
    getPlanCredits: "lee la tabla de planes, que es de la plataforma",

    // — Guardan por rol de plataforma, no por alcance de cuenta —
    getAllPlanConfigs: "pide isAdminLike: es configuración de la casa",
    updatePlanConfigAction: "pide isAdminLike, como su hermana: son los créditos por plan de la casa",
    createAiProvider: "catálogo de la plataforma; su puerta es el rol",
    updateAiProvider: "catálogo de la plataforma; su puerta es el rol y no el alcance de una cuenta",
    deleteAiProvider: "catálogo de la plataforma; su puerta es el rol y no el alcance de una cuenta",
    createAiModel: "catálogo de la plataforma; su puerta es el rol y no el alcance de una cuenta",
    updateAiModel: "catálogo de la plataforma; su puerta es el rol y no el alcance de una cuenta",
    deleteAiModel: "catálogo de la plataforma; su puerta es el rol y no el alcance de una cuenta",
    getAiKeyOriginInfo: "no recibe cuenta: dice de dónde sale una llave del registro de Verzay",
    inheritResellerAiConfig:
        "corre dentro de la creación de un cliente, cuya acción ya comprobó quién llama",
};

/**
 * Saca los nombres de las acciones exportadas y el trozo de fichero de cada una.
 *
 * El trozo va **desde su `export` hasta el `export` siguiente**, y no con un
 * conteo de llaves. Contar llaves parece lo correcto y aquí falla: el `{` que
 * viene después de los parámetros suele ser el de la anotación de retorno
 * —`Promise<{ success: boolean; … }>`—, así que el «cuerpo» salía siendo el
 * tipo y la guarda no aparecía por ningún lado. Se vio porque el banco marcó
 * como abiertas treinta acciones que tenían la guarda escrita dos líneas más
 * abajo: **un número que no puede ser señala el sitio.**
 */
function accionesDe(src) {
    const marcas = [];
    const re = /export\s+async\s+function\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g;
    let m;
    while ((m = re.exec(src))) marcas.push({ nombre: m[1], desde: m.index });

    return marcas.map((marca, i) => ({
        nombre: marca.nombre,
        cuerpo: src.slice(marca.desde, marcas[i + 1]?.desde ?? src.length),
    }));
}

test("cada acción del lote pasa por una puerta, o dice por qué no", () => {
    const abiertas = [];
    let comprobadas = 0;

    for (const fichero of FICHEROS) {
        const src = readFileSync(new URL(`../../${fichero}`, import.meta.url), "utf8");
        for (const { nombre, cuerpo } of accionesDe(src)) {
            comprobadas++;
            if (PUERTAS.some((p) => cuerpo.includes(`${p}(`))) continue;
            if (nombre in SIN_GUARDA) continue;
            abiertas.push(`${fichero} :: ${nombre}`);
        }
    }

    assert.ok(comprobadas > 80, `se esperaban más acciones, se leyeron ${comprobadas}`);
    assert.deepEqual(
        abiertas,
        [],
        `estas acciones no pasan por ninguna puerta y no están en SIN_GUARDA:\n  ${abiertas.join("\n  ")}`,
    );
});

test("ninguna exclusión se cuela sin motivo", () => {
    for (const [nombre, motivo] of Object.entries(SIN_GUARDA)) {
        assert.ok(
            typeof motivo === "string" && motivo.trim().length > 20,
            `la exclusión de ${nombre} no explica por qué`,
        );
    }
});

test("la guarda se usa, no solo se comprueba: el id que decide es el que devuelve", () => {
    // El medio arreglo que este repositorio ya pagó una vez: comprobar la
    // cuenta y luego consultar con el id original. Aquí se prueba en los
    // ficheros donde la guarda devuelve la cuenta en una variable `cuenta`.
    const conVariable = [
        "actions/tag-actions.ts",
        "actions/tools-action.ts",
        "actions/evo-url-action.ts",
        "actions/rr-actions.ts",
        "actions/user-nav-preference-actions.ts",
    ];
    for (const fichero of conVariable) {
        const src = readFileSync(new URL(`../../${fichero}`, import.meta.url), "utf8");
        for (const { nombre, cuerpo } of accionesDe(src)) {
            if (!cuerpo.includes("const cuenta = await laCuentaDeLaAccion(")) continue;
            assert.ok(
                !/where:\s*\{\s*userId\s*[,}]/.test(cuerpo) &&
                    !/data:\s*\{\s*userId\s*[,}]/.test(cuerpo),
                `${fichero} :: ${nombre} comprueba la cuenta y luego consulta con el userId del navegador`,
            );
        }
    }
});
