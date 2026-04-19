import { Country } from '@/components/custom/CountryCodeSelect';
import { Instancia, User, Service, ApiKey, Reminders } from '@prisma/client';

interface UserWithIntance extends User {
    instancias: Instancia[]; // Array de registros Pausar
};

interface UserWithService extends UserWithIntance {
    services: Service[];
};

export interface UserWithApiKeys extends UserWithService {
    apiKey: ApiKey | null; //  Esto es lo que tienes
};

export interface ScheduleInterface {
    user: UserWithApiKeys // Array de registros Pausar
    reminders?: Reminders[]
    countries?: Country[]
};
