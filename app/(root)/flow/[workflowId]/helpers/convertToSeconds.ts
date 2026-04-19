type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days';

const unitToSeconds: Record<TimeUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};

export function convertToSeconds(delay: string): string {
  const [unit, valueStr] = delay.split('-');
  const value = parseInt(valueStr, 10);

  if (!['seconds', 'minutes', 'hours', 'days'].includes(unit) || isNaN(value)) {
    throw new Error(`Formato inválido: ${delay}`);
  }

  const seconds = value * unitToSeconds[unit as TimeUnit];
  const newDelay = `${unit}-${seconds}`


  return newDelay;
}


