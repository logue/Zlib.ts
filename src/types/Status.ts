export const Status: Record<string, number> = {
  INITIALIZED: 0,
  BLOCK_HEADER_START: 1,
  BLOCK_HEADER_END: 2,
  BLOCK_BODY_START: 3,
  BLOCK_BODY_END: 4,
  DECODE_BLOCK_START: 5,
  DECODE_BLOCK_END: 6,
};

export type StatusType = typeof Status[keyof typeof Status];
