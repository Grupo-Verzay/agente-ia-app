// Lo que el banco de la grabación de la videollamada ejerce contra Postgres.
export { POST } from "@/app/api/videollamada/grabacion/route";
export { cerrarYJuntarLaGrabacionDeLaSala, recogerLasGrabacionesDeLaSala } from "@/lib/grabacion-de-videollamada.server";
export { copiarLaGrabacionAlCrm, laGrabacionDeLaSala, reclamarLaCreacion } from "@/lib/videollamada-ia-db";
export { laFirmaDeLaCita } from "@/lib/videollamada-ia.server";
export { bucket, fallan } from "@/lib/__tests__/fingido/minio-de-la-videollamada";
export { db } from "@/lib/db";
