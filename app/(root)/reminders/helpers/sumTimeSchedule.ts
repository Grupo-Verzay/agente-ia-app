import { addHours, addMinutes, isValid, format } from "date-fns"

export function sumTimeSchedule(dateSchedule: string | Date, timeStr: string): string | null {
    // Asegurar que dateSchedule sea un objeto Date válido
    const baseDate = typeof dateSchedule === "string"
        ? new Date(dateSchedule)
        : dateSchedule

    if (!isValid(baseDate)) {
        console.error("Fecha inválida:", dateSchedule)
        return null
    }

    // Extraer la hora desde "16/07/2025 23:05"
    const timePart = timeStr.split(" ")[1] // "23:05"
    if (!timePart) return null

    const [hours, minutes] = timePart.split(":").map(Number)

    const withHours = addHours(baseDate, hours)
    const withMinutes = addMinutes(withHours, minutes)

    return format(withMinutes, "dd/MM/yyyy HH:mm")
}