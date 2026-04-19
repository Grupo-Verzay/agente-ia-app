export const addPromptItem = (lines: string[], label: string, value?: string) => {
    if (value && value.trim()) lines.push(`${label} ${value.trim()}`);
}