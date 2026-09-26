/**
 * Lo que el banco de reglas necesita en un solo paquete: la decisión pura y la
 * lista que el menú ofrece. Van juntas a propósito —el banco las ENCADENA—,
 * porque el fallo de esta familia no es que una de las dos esté mal: es que se
 * separen.
 */
export { seVeLaCalificacion, comoCalificacion } from "@/lib/calificacion-del-lead";
export {
    LEAD_STATUS_FILTER_OPTIONS,
    LEAD_STATUS_LABELS,
} from "@/app/(root)/crm/dashboard/helpers/leadStatus";
