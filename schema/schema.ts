import { Country } from '@/components/custom/CountryCodeSelect';
import { Service, Reminders } from '@prisma/client';
import type { CurrentUser } from '@/lib/auth';

/**
 * El usuario tal y como llega a las pantallas.
 *
 * Antes decia `extends User`, o sea las ~80 columnas de la tabla, pero a las
 * pantallas nunca les llega eso: les llega lo que devuelve `currentUser()`,
 * que trae a proposito solo las columnas que se usan en cada navegacion. El
 * tipo prometia campos que en tiempo de ejecucion venian `undefined`, y de ahi
 * salian una veintena de errores de tipos por toda la App.
 *
 * `services` queda opcional porque `currentUser()` no lo trae; lo pasa aparte
 * quien lo necesita.
 *
 * El `import type` se borra al compilar, asi que esto no arrastra `lib/auth`
 * -ni `next/headers`- a los componentes de cliente.
 */
export type UserWithApiKeys = CurrentUser & {
    services?: Service[];
};

/**
 * La cuenta tal y como llega a la pagina PUBLICA de agendar (`/schedule/[userId]`).
 *
 * Era la fila ENTERA de `User` —con la clave GLOBAL del servidor de Evolution
 * (`apiKey`), el token de cada linea (`instancias[].instanceId`), el correo y
 * todas las columnas de la tabla— y viajaba al navegador de cualquiera que
 * abriera el enlace. Ahora es una lista cerrada con lo que la pagina pinta:
 * quien no esta aqui, no viaja. Si hace falta otro dato, se añade con su motivo
 * y nunca una clave: lo que necesita claves lo hace el servidor
 * (`confirmarLaCitaPublicaAction`).
 */
export type UserConServicios = {
    id: string;
    image: string | null;
    company: string | null;
    timezone: string | null;
    meetingDuration: number | null;
    minNoticeMinutes: number | null;
    services: Service[];
    /** El NOMBRE de la linea con la que se agenda. El nombre, nunca su token. */
    lineaDeLaAgenda: string | null;
};

export interface ScheduleInterface {
    user: UserWithApiKeys
    reminders?: Reminders[]
    countries?: Country[]
    instancePhone?: string | null
    prefillName?: string
    prefillPhone?: string
    /**
     * Días de la semana (0=domingo … 6=sábado) que el asesor tiene configurados
     * en Disponibilidad. Sirve para apagarlos en el calendario: antes se podía
     * elegir un sábado y solo al pasar al paso de Hora salía "No hay horarios
     * disponibles", dejando al cliente sin salida.
     */
    availableWeekdays?: number[]
};
