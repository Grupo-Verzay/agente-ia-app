import { Plan } from "@prisma/client";

/**
 * Cómo se llama cada plan cuando la marca no le puso nombre.
 *
 * Eran nombres comerciales inventados —"Avanzado", "Agencias"—, y ninguno
 * existe: cada marca bautiza sus planes como quiere y renombra cuando quiere.
 * Poner uno de esos por defecto era enseñar un nombre que no es de nadie.
 *
 * El nivel, en cambio, no cambia nunca. Donde la marca sí escribió un nombre,
 * ese manda y esto no se ve.
 */
export const PLAN_LABELS: Record<Plan, string> = {
    lite: 'Nivel 1',
    basico: 'Nivel 2',
    intermedio: 'Nivel 3',
    avanzado: 'Nivel 4',
    enterprise: 'Nivel 5',
    personalizado: 'Nivel 6',
};

export const PLANS: Plan[] = ['lite', 'basico', 'intermedio', 'avanzado', 'enterprise', 'personalizado'];

export const PLAN_VALUES = PLANS as [Plan, ...Plan[]];

/**
 * Nombre de cada plan en las pantallas INTERNAS (módulos, permisos).
 *
 * Ahí no se puede usar el nombre comercial: el mismo plan interno se llama
 * distinto en cada marca —Verzay y Aizen-Bot venden tres cada una sobre estos
 * seis— y esas pantallas hablan de los seis a la vez. Poner el nombre de una
 * marca sería mentir para la otra.
 *
 * El número es la posición en PLANS, que ya está en orden ascendente de
 * capacidad. Así el orden queda explícito: "Lite, Básico, Intermedio" no se lee
 * como una escala hasta que uno se para a pensarlo; "Nivel 1, 2, 3" sí.
 */
export const PLAN_LEVEL_LABELS: Record<Plan, string> = PLANS.reduce(
    (acc, plan, indice) => {
        acc[plan] = `Nivel ${indice + 1}`;
        return acc;
    },
    {} as Record<Plan, string>,
);
