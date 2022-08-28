export const CompressionMethod: Record<string, number> = {
  UNDEFINED: 0,
  DEFLATE: 8,
  RESERVED: 15,
};

export type CompressionMethodType =
  typeof CompressionMethod[keyof typeof CompressionMethod];
