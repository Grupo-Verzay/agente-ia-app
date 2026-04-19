// helpers/getTimezoneByCountry.ts

// import { getCode } from 'country-list';
// import { getTimezones } from 'country-timezone-list';

/**
 * Retorna la zona horaria principal asociada a un país.
 *
 * @param countryName - Nombre del país (ej. "Colombia", "Afghanistan").
 * @returns La zona horaria en formato IANA (ej. "SERVER_TIME_ZONE", "Asia/Kabul") o `null` si no se encuentra.
 *
 * @example
 * const timezone = getTimezoneByCountry("Colombia");
 */
// export function getTimezoneByCountry(countryName: string): string | null {
//   if (!countryName) return null;

//   const isoCode = getCode(countryName); // Convierte el nombre a código ISO (ej. "Colombia" → "CO")
//   if (!isoCode) return null;

//   const zones = getTimezones(isoCode);
//   return zones.length > 0 ? zones[0].timezone : null;
// }
