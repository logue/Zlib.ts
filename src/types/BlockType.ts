export const BlockType: Record<string, number> = {
  UNCOMPRESSED: 0,
  FIXED: 1,
  DYNAMIC: 2,
};

export type BlockTypeType = typeof BlockType[keyof typeof BlockType];
