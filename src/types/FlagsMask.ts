export const FlagsMask: Record<string, number> = {
  FTEXT: 0x01,
  FHCRC: 0x02,
  FEXTRA: 0x04,
  FNAME: 0x08,
  FCOMMENT: 0x10,
};

export type FlagsMaskType = typeof FlagsMask[keyof typeof FlagsMask];
