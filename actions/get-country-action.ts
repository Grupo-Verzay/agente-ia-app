'use server'

export interface Country {
    name: string
    code: string
    flag: string
}

export const getCountryCodes = async () => {
  try {
    const res = await fetch(
      'https://restcountries.com/v3.1/region/americas?fields=name,idd,flags',
      { next: { revalidate: 60 * 60 } } // caché 1h (opcional)
    );

    if (!res.ok) throw new Error('Error al obtener países');

    const data = await res.json();

    const countries = data
      .map((country: any) => {
        const root = country?.idd?.root;           // ej: '+'
        const suffixes = country?.idd?.suffixes;   // ej: ['809','829','849'] o ['507']

        if (!root || !Array.isArray(suffixes) || suffixes.length === 0) return null;

        const codes = suffixes.map((s: string) => `${root}${s}`); // todos los indicativos

        return {
          name: country.name.common,               // 'Dominican Republic' / 'Panama'
          codes,                                   // ej RD: ['+1809','+1829','+1849'] ; Panamá: ['+507']
          flag: country.flags?.svg || '',
        };
      })
      .filter(Boolean)
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    return countries;
  } catch (error) {
    console.error('[getCountryCodes]', error);
    return [];
  }
};