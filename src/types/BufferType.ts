export const BufferType: Record<string, number> = {
  BLOCK: 0,
  ADAPTIVE: 1,
};
export type BufferTypeType = typeof BufferType[keyof typeof BufferType];
