export const OperatingSystem: Record<string, number> = {
  FAT: 0,
  AMIGA: 1,
  VMS: 2,
  UNIX: 3,
  VM_CMS: 4,
  ATARI_TOS: 5,
  HPFS: 6,
  MACINTOSH: 7,
  Z_SYSTEM: 8,
  CP_M: 9,
  TOPS_20: 10,
  NTFS: 11,
  QDOS: 12,
  ACORN_RISCOS: 13,
  UNKNOWN: 255,
};

export type OperatingSystemType =
  typeof OperatingSystem[keyof typeof OperatingSystem];
