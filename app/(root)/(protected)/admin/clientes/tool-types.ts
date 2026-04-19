// tool-types.ts
export const allowedToolNames = ['drive', 'docs', 'sheets'] as const;
export type Tools = (typeof allowedToolNames)[number];
