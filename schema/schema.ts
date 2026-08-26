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
 * El usuario de la pagina publica de agendamiento. Esa pagina no usa
 * `currentUser()` -no hay sesion: entra el cliente final-, hace su propia
 * consulta y SI trae los servicios, que son sobre los que el cliente elige.
 */
export type UserConServicios = Omit<UserWithApiKeys, 'effectiveId' | 'sessionUserId'> & {
    services: Service[];
    // No hay sesion en esa pagina, asi que no hay "usuario efectivo" ni
    // "usuario de la sesion": entra el cliente final, sin cuenta.
    effectiveId?: string;
    sessionUserId?: string;
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
