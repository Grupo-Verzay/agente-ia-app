'use server'

export interface Country {
    name: string
    code: string
    flag: string
}

const FALLBACK_COUNTRIES = [
  { name: 'Colombia',          codes: ['+57'],        flag: 'https://flagcdn.com/co.svg' },
  { name: 'Venezuela',         codes: ['+58'],        flag: 'https://flagcdn.com/ve.svg' },
  { name: 'Ecuador',           codes: ['+593'],       flag: 'https://flagcdn.com/ec.svg' },
  { name: 'Peru',              codes: ['+51'],        flag: 'https://flagcdn.com/pe.svg' },
  { name: 'Mexico',            codes: ['+52'],        flag: 'https://flagcdn.com/mx.svg' },
  { name: 'Chile',             codes: ['+56'],        flag: 'https://flagcdn.com/cl.svg' },
  { name: 'Argentina',         codes: ['+54'],        flag: 'https://flagcdn.com/ar.svg' },
  { name: 'Bolivia',           codes: ['+591'],       flag: 'https://flagcdn.com/bo.svg' },
  { name: 'Brazil',            codes: ['+55'],        flag: 'https://flagcdn.com/br.svg' },
  { name: 'Costa Rica',        codes: ['+506'],       flag: 'https://flagcdn.com/cr.svg' },
  { name: 'Cuba',              codes: ['+53'],        flag: 'https://flagcdn.com/cu.svg' },
  { name: 'Dominican Republic',codes: ['+1809','+1829','+1849'], flag: 'https://flagcdn.com/do.svg' },
  { name: 'El Salvador',       codes: ['+503'],       flag: 'https://flagcdn.com/sv.svg' },
  { name: 'Guatemala',         codes: ['+502'],       flag: 'https://flagcdn.com/gt.svg' },
  { name: 'Honduras',          codes: ['+504'],       flag: 'https://flagcdn.com/hn.svg' },
  { name: 'Nicaragua',         codes: ['+505'],       flag: 'https://flagcdn.com/ni.svg' },
  { name: 'Panama',            codes: ['+507'],       flag: 'https://flagcdn.com/pa.svg' },
  { name: 'Paraguay',          codes: ['+595'],       flag: 'https://flagcdn.com/py.svg' },
  { name: 'Puerto Rico',       codes: ['+1787','+1939'], flag: 'https://flagcdn.com/pr.svg' },
  { name: 'United States',     codes: ['+1'],         flag: 'https://flagcdn.com/us.svg' },
  { name: 'Uruguay',           codes: ['+598'],       flag: 'https://flagcdn.com/uy.svg' },
].sort((a, b) => a.name.localeCompare(b.name));

export const getCountryCodes = async () => {
  try {
    const res = await fetch(
      'https://restcountries.com/v3.1/region/americas?fields=name,idd,flags',
      { next: { revalidate: 60 * 60 } }
    );

    if (!res.ok) throw new Error('Error al obtener países');

    const data = await res.json();

    const countries = data
      .map((country: any) => {
        const root = country?.idd?.root;
        const suffixes = country?.idd?.suffixes;

        if (!root || !Array.isArray(suffixes) || suffixes.length === 0) return null;

        const codes = suffixes.map((s: string) => `${root}${s}`);

        return {
          name: country.name.common,
          codes,
          flag: country.flags?.svg || '',
        };
      })
      .filter(Boolean)
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    return countries.length > 0 ? countries : FALLBACK_COUNTRIES;
  } catch (error) {
    console.error('[getCountryCodes] API falló, usando lista local:', error);
    return FALLBACK_COUNTRIES;
  }
};
