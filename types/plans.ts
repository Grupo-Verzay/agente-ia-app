import { Plan } from "@prisma/client";

export const PLAN_LABELS: Record<Plan, string> = {
    lite: 'Lite',
    basico: 'Básico',
    intermedio: 'Intermedio',
    avanzado: 'Avanzado',
    enterprise: 'Enterprise',
    personalizado: 'Personalizado',
    unico: 'Unico',
};

// Orden visual en dropdowns y UI (unico excluido — plan heredado sin uso activo)
export const PLANS: Plan[] = ['lite', 'basico', 'intermedio', 'avanzado', 'enterprise', 'personalizado'];

export const PLAN_VALUES = PLANS as [Plan, ...Plan[]];
