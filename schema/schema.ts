import { Country } from '@/components/custom/CountryCodeSelect';
import { Instancia, User, Service, ApiKey, Reminders } from '@prisma/client';

interface UserWithIntance extends User {
    instancias: Instancia[]; // Array de registros Pausar
};

interface UserWithService extends UserWithIntance {
    services: Service[];
};

export interface UserWithApiKeys extends UserWithService {
    apiKey: ApiKey | null;
    effectiveId?: string;
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
