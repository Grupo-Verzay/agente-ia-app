import { formatInTimeZone } from "date-fns-tz";

export const subtractSecondsFromTime = (date: Date, seconds: number): string => {
    const newDate = new Date(date.getTime() - seconds * 1000);
    return formatInTimeZone(newDate, 'UTC', 'dd/MM/yyyy HH:mm');
};
