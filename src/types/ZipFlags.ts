export const ZipFlags: Record<string, number> = {
  UNDEFINED: 0x0000,
  ENCRYPT: 0x0001,
  DESCRIPTOR: 0x0008,
  UTF8: 0x0800,
};

export type ZipFlagsType = typeof ZipFlags[keyof typeof ZipFlags];
