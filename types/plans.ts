import { Plan } from "@prisma/client";

export const PLANS = Object.values(Plan);
export const PLAN_LABELS: Record<Plan, string> = {
    enterprise: 'Enterprise',
    lite: 'Lite',
    unico: 'Unico',
    basico: 'Básico',
    intermedio: 'Intermedio',
    avanzado: 'Avanzado',
    personalizado: 'Personalizado',
};

export const PLAN_VALUES = Object.values(Plan) as [Plan, ...Plan[]];
