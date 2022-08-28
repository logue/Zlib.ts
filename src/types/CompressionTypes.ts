/**
 * CompressionType
 */
export const CompressionType: Record<string, number> = {
  NONE: 0,
  FIXED: 1,
  DYNAMIC: 2,
  RESERVED: 3,
} as const;

export type CompressionTypeType =
  typeof CompressionType[keyof typeof CompressionType];
