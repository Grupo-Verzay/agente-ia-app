import { Plan } from "@prisma/client";

export const PLAN_LABELS: Record<Plan, string> = {
    lite: 'Lite',
    basico: 'Básico',
    intermedio: 'Intermedio',
    avanzado: 'Avanzado',
    enterprise: 'Enterprise',
    personalizado: 'Agencias',
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
