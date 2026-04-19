export function nonEmpty(s?: string) {
    return s && s.trim().length > 0 ? s.trim() : '';
}