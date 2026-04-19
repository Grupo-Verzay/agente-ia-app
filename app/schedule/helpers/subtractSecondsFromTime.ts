import { format } from "date-fns";

// export const subtractSecondsFromTime = (timeStr: string, seconds: number): string => {
//     const date = new Date(timeStr);
//     const newDate = new Date(date.getTime() - seconds * 1000);
//     return newDate.toISOString();
// }
export const subtractSecondsFromTime = (date: Date, seconds: number): string => {
    const newDate = new Date(date.getTime() - seconds * 1000);
    return format(newDate, 'dd/MM/yyyy HH:mm');
};
