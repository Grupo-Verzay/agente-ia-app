import { StepTraining } from "@/types/agentAi";
import { nanoid } from "nanoid";

export const CADENA_STEPS: Omit<StepTraining, "id">[] = [
    { title: "CONEXIÓN",     mainMessage: "", elements: [] },
    { title: "AVERIGUACIÓN", mainMessage: "", elements: [] },
    { title: "DIAGNÓSTICO",  mainMessage: "", elements: [] },
    { title: "EXPOSICIÓN",   mainMessage: "", elements: [] },
    { title: "NEGOCIACIÓN",  mainMessage: "", elements: [] },
    { title: "ACUERDO",      mainMessage: "", elements: [] },
];

export function buildCadenaSteps(): StepTraining[] {
    return CADENA_STEPS.map((s) => ({ ...s, id: nanoid() }));
}
