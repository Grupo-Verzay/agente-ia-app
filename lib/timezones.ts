export const AMERICA_TIMEZONES = [
    { "country": "Argentina", "iso2": "AR", "default": "America/Argentina/Buenos_Aires", "timezones": ["America/Argentina/Buenos_Aires"] },
    { "country": "Bolivia", "iso2": "BO", "default": "America/La_Paz", "timezones": ["America/La_Paz"] },
    { "country": "Brazil", "iso2": "BR", "default": "America/Sao_Paulo", "timezones": ["America/Noronha", "America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Porto_Velho", "America/Boa_Vista", "America/Rio_Branco", "America/Eirunepe", "America/Fortaleza", "America/Recife", "America/Belem"] },
    { "country": "Canada", "iso2": "CA", "default": "America/Toronto", "timezones": ["America/St_Johns", "America/Halifax", "America/Moncton", "America/Toronto", "America/Winnipeg", "America/Regina", "America/Edmonton", "America/Vancouver", "America/Whitehorse", "America/Dawson"] },
    { "country": "Chile", "iso2": "CL", "default": "America/Santiago", "timezones": ["America/Santiago", "America/Punta_Arenas", "Pacific/Easter"] },
    { "country": "Colombia", "iso2": "CO", "default": "America/Bogota", "timezones": ["America/Bogota"] },
    { "country": "Costa Rica", "iso2": "CR", "default": "America/Costa_Rica", "timezones": ["America/Costa_Rica"] },
    { "country": "Cuba", "iso2": "CU", "default": "America/Havana", "timezones": ["America/Havana"] },
    { "country": "Dominican Republic", "iso2": "DO", "default": "America/Santo_Domingo", "timezones": ["America/Santo_Domingo"] },
    { "country": "Ecuador", "iso2": "EC", "default": "America/Guayaquil", "timezones": ["America/Guayaquil", "Pacific/Galapagos"] },
    { "country": "El Salvador", "iso2": "SV", "default": "America/El_Salvador", "timezones": ["America/El_Salvador"] },
    { "country": "Guatemala", "iso2": "GT", "default": "America/Guatemala", "timezones": ["America/Guatemala"] },
    { "country": "Haiti", "iso2": "HT", "default": "America/Port-au-Prince", "timezones": ["America/Port-au-Prince"] },
    { "country": "Honduras", "iso2": "HN", "default": "America/Tegucigalpa", "timezones": ["America/Tegucigalpa"] },
    { "country": "Jamaica", "iso2": "JM", "default": "America/Jamaica", "timezones": ["America/Jamaica"] },
    { "country": "Mexico", "iso2": "MX", "default": "America/Mexico_City", "timezones": ["America/Tijuana", "America/Hermosillo", "America/Chihuahua", "America/Mazatlan", "America/Monterrey", "America/Mexico_City", "America/Merida", "America/Cancun"] },
    { "country": "Nicaragua", "iso2": "NI", "default": "America/Managua", "timezones": ["America/Managua"] },
    { "country": "Panama", "iso2": "PA", "default": "America/Panama", "timezones": ["America/Panama"] },
    { "country": "Paraguay", "iso2": "PY", "default": "America/Asuncion", "timezones": ["America/Asuncion"] },
    { "country": "Peru", "iso2": "PE", "default": "America/Lima", "timezones": ["America/Lima"] },
    { "country": "Puerto Rico", "iso2": "PR", "default": "America/Puerto_Rico", "timezones": ["America/Puerto_Rico"] },
    { "country": "United States", "iso2": "US", "default": "America/New_York", "timezones": ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu"] },
    { "country": "Uruguay", "iso2": "UY", "default": "America/Montevideo", "timezones": ["America/Montevideo"] },
    { "country": "Venezuela", "iso2": "VE", "default": "America/Caracas", "timezones": ["America/Caracas"] },
    { "country": "Belize", "iso2": "BZ", "default": "America/Belize", "timezones": ["America/Belize"] },
    { "country": "Bahamas", "iso2": "BS", "default": "America/Nassau", "timezones": ["America/Nassau"] },
    { "country": "Barbados", "iso2": "BB", "default": "America/Barbados", "timezones": ["America/Barbados"] },
    { "country": "Bermuda", "iso2": "BM", "default": "Atlantic/Bermuda", "timezones": ["Atlantic/Bermuda"] },
    { "country": "Trinidad and Tobago", "iso2": "TT", "default": "America/Port_of_Spain", "timezones": ["America/Port_of_Spain"] },
    { "country": "Guyana", "iso2": "GY", "default": "America/Guyana", "timezones": ["America/Guyana"] },
    { "country": "Suriname", "iso2": "SR", "default": "America/Paramaribo", "timezones": ["America/Paramaribo"] },
    { "country": "French Guiana", "iso2": "GF", "default": "America/Cayenne", "timezones": ["America/Cayenne"] },
    { "country": "Greenland", "iso2": "GL", "default": "America/Nuuk", "timezones": ["America/Nuuk", "America/Thule", "America/Scoresbysund", "America/Danmarkshavn"] }
]

// Mapa prefijo telefónico → timezone IANA (prefijos más largos primero para evitar coincidencias parciales)
export const PHONE_PREFIX_TZ_MAP: [string, string][] = [
  // ── América (3 dígitos) ───────────────────────────────────────────────────
  ['598', 'America/Montevideo'],              // Uruguay
  ['597', 'America/Paramaribo'],             // Suriname
  ['595', 'America/Asuncion'],               // Paraguay
  ['593', 'America/Guayaquil'],              // Ecuador
  ['592', 'America/Guyana'],                 // Guyana
  ['591', 'America/La_Paz'],                 // Bolivia
  ['509', 'America/Port-au-Prince'],         // Haití
  ['507', 'America/Panama'],                 // Panamá
  ['506', 'America/Costa_Rica'],             // Costa Rica
  ['505', 'America/Managua'],                // Nicaragua
  ['504', 'America/Tegucigalpa'],            // Honduras
  ['503', 'America/El_Salvador'],            // El Salvador
  ['502', 'America/Guatemala'],              // Guatemala
  // ── Europa (3 dígitos) ────────────────────────────────────────────────────
  ['421', 'Europe/Bratislava'],              // Eslovaquia
  ['420', 'Europe/Prague'],                  // República Checa
  ['385', 'Europe/Zagreb'],                  // Croacia
  ['381', 'Europe/Belgrade'],                // Serbia
  ['380', 'Europe/Kiev'],                    // Ucrania
  ['372', 'Europe/Tallinn'],                 // Estonia
  ['371', 'Europe/Riga'],                    // Letonia
  ['370', 'Europe/Vilnius'],                 // Lituania
  ['358', 'Europe/Helsinki'],                // Finlandia
  ['353', 'Europe/Dublin'],                  // Irlanda
  ['352', 'Europe/Luxembourg'],              // Luxemburgo
  ['351', 'Europe/Lisbon'],                  // Portugal
  // ── Oriente Medio (3 dígitos) ─────────────────────────────────────────────
  ['974', 'Asia/Qatar'],                     // Qatar
  ['973', 'Asia/Bahrain'],                   // Bahréin
  ['972', 'Asia/Jerusalem'],                 // Israel
  ['971', 'Asia/Dubai'],                     // Emiratos Árabes
  ['968', 'Asia/Muscat'],                    // Omán
  ['966', 'Asia/Riyadh'],                    // Arabia Saudita
  ['965', 'Asia/Kuwait'],                    // Kuwait
  ['964', 'Asia/Baghdad'],                   // Iraq
  ['962', 'Asia/Amman'],                     // Jordania
  ['961', 'Asia/Beirut'],                    // Líbano
  // ── Asia Central (3 dígitos) ──────────────────────────────────────────────
  ['998', 'Asia/Tashkent'],                  // Uzbekistán
  ['996', 'Asia/Bishkek'],                   // Kirguistán
  ['995', 'Asia/Tbilisi'],                   // Georgia
  ['994', 'Asia/Baku'],                      // Azerbaiyán
  ['993', 'Asia/Ashgabat'],                  // Turkmenistán
  ['992', 'Asia/Dushanbe'],                  // Tayikistán
  ['977', 'Asia/Kathmandu'],                 // Nepal
  ['880', 'Asia/Dhaka'],                     // Bangladesh
  ['856', 'Asia/Vientiane'],                 // Laos
  ['855', 'Asia/Phnom_Penh'],                // Camboya
  ['852', 'Asia/Hong_Kong'],                 // Hong Kong
  // ── África (3 dígitos) ────────────────────────────────────────────────────
  ['267', 'Africa/Gaborone'],                // Botsuana
  ['266', 'Africa/Maseru'],                  // Lesoto
  ['265', 'Africa/Blantyre'],                // Malaui
  ['264', 'Africa/Windhoek'],                // Namibia
  ['263', 'Africa/Harare'],                  // Zimbabue
  ['260', 'Africa/Lusaka'],                  // Zambia
  ['256', 'Africa/Kampala'],                 // Uganda
  ['255', 'Africa/Dar_es_Salaam'],           // Tanzania
  ['254', 'Africa/Nairobi'],                 // Kenia
  ['251', 'Africa/Addis_Ababa'],             // Etiopía
  ['250', 'Africa/Kigali'],                  // Ruanda
  ['249', 'Africa/Khartoum'],                // Sudán
  ['244', 'Africa/Luanda'],                  // Angola
  ['243', 'Africa/Kinshasa'],                // RD Congo
  ['237', 'Africa/Douala'],                  // Camerún
  ['234', 'Africa/Lagos'],                   // Nigeria
  ['233', 'Africa/Accra'],                   // Ghana
  ['225', 'Africa/Abidjan'],                 // Costa de Marfil
  ['221', 'Africa/Dakar'],                   // Senegal
  ['218', 'Africa/Tripoli'],                 // Libia
  ['216', 'Africa/Tunis'],                   // Túnez
  ['213', 'Africa/Algiers'],                 // Argelia
  ['212', 'Africa/Casablanca'],              // Marruecos
  // ── América del Sur (2 dígitos) ───────────────────────────────────────────
  ['58',  'America/Caracas'],                // Venezuela
  ['57',  'America/Bogota'],                 // Colombia
  ['56',  'America/Santiago'],               // Chile
  ['55',  'America/Sao_Paulo'],              // Brasil
  ['54',  'America/Argentina/Buenos_Aires'], // Argentina
  ['53',  'America/Havana'],                 // Cuba
  ['52',  'America/Mexico_City'],            // México
  ['51',  'America/Lima'],                   // Perú
  // ── Europa (2 dígitos) ────────────────────────────────────────────────────
  ['49',  'Europe/Berlin'],                  // Alemania
  ['48',  'Europe/Warsaw'],                  // Polonia
  ['47',  'Europe/Oslo'],                    // Noruega
  ['46',  'Europe/Stockholm'],               // Suecia
  ['45',  'Europe/Copenhagen'],              // Dinamarca
  ['44',  'Europe/London'],                  // Reino Unido
  ['43',  'Europe/Vienna'],                  // Austria
  ['41',  'Europe/Zurich'],                  // Suiza
  ['40',  'Europe/Bucharest'],               // Rumanía
  ['39',  'Europe/Rome'],                    // Italia
  ['36',  'Europe/Budapest'],                // Hungría
  ['34',  'Europe/Madrid'],                  // España
  ['33',  'Europe/Paris'],                   // Francia
  ['32',  'Europe/Brussels'],                // Bélgica
  ['31',  'Europe/Amsterdam'],               // Países Bajos
  ['30',  'Europe/Athens'],                  // Grecia
  // ── África (2 dígitos) ────────────────────────────────────────────────────
  ['27',  'Africa/Johannesburg'],            // Sudáfrica
  ['20',  'Africa/Cairo'],                   // Egipto
  // ── Asia / Oceanía (2 dígitos) ────────────────────────────────────────────
  ['94',  'Asia/Colombo'],                   // Sri Lanka
  ['92',  'Asia/Karachi'],                   // Pakistán
  ['91',  'Asia/Kolkata'],                   // India
  ['90',  'Europe/Istanbul'],                // Turquía
  ['86',  'Asia/Shanghai'],                  // China
  ['84',  'Asia/Ho_Chi_Minh'],               // Vietnam
  ['82',  'Asia/Seoul'],                     // Corea del Sur
  ['81',  'Asia/Tokyo'],                     // Japón
  ['66',  'Asia/Bangkok'],                   // Tailandia
  ['65',  'Asia/Singapore'],                 // Singapur
  ['64',  'Pacific/Auckland'],               // Nueva Zelanda
  ['63',  'Asia/Manila'],                    // Filipinas
  ['62',  'Asia/Jakarta'],                   // Indonesia
  ['61',  'Australia/Sydney'],               // Australia
  ['60',  'Asia/Kuala_Lumpur'],              // Malasia
  // ── 1 dígito (siempre al final) ───────────────────────────────────────────
  ['7',   'Europe/Moscow'],                  // Rusia / Kazajistán
  ['1',   'America/New_York'],               // EE.UU. / Canadá
];

/**
 * Detecta la timezone IANA a partir de un número de teléfono o remoteJid de WhatsApp.
 * Acepta tanto "5731234567" como "5731234567@s.whatsapp.net".
 */
export function getTimezoneFromPhone(phone: string, fallback: string): string {
  const digits = (phone ?? '').split('@')[0].replace(/\D/g, '');
  for (const [prefix, tz] of PHONE_PREFIX_TZ_MAP) {
    if (digits.startsWith(prefix)) return tz;
  }
  return fallback;
}
