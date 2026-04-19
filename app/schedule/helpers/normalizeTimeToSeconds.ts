type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days';

const unitToSeconds: Record<TimeUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};

export const normalizeTimeToSeconds = (timeStr: string): number => {
  const [unit, valueStr] = timeStr.split("-");
  const value = parseInt(valueStr);
  if (!unit || isNaN(value) || !(unit in unitToSeconds)) return 0;
  return value * unitToSeconds[unit as TimeUnit];
};