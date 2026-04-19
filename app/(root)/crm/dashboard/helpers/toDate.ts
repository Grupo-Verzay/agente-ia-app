export function toDate(v: Date | string): Date {
    return v instanceof Date ? v : new Date(v);
}