// Lo que el banco de la grabación completa y del «Salir» ejerce contra Postgres.
export { POST } from "@/app/api/videollamada/grabacion/route";
export * as Sala from "@/app/api/videollamada/sala/route";
export { copiarLaGrabacionAlCrm, laGrabacionDeLaSala, laVideollamada, reclamarLaCreacion, apuntarLaConversacion, guardarElAvatarPropio } from "@/lib/videollamada-ia-db";
export { laFirmaDeLaCita } from "@/lib/videollamada-ia.server";
export { bucket } from "@/lib/__tests__/fingido/minio-de-la-videollamada";
export { db } from "@/lib/db";
