/** Gunzip Member */
export default class GunzipMember {
  /**  signature first byte. */
  id1!: number;
  /** signature second byte. */
  id2!: number;
  /** compression method. */
  cm!: number;
  /** flags. */
  flg!: number;
  /** modification time. */
  mtime!: Date;
  /**  extra flags. */
  xfl!: number;
  /**  operating system number. */
  os!: number;
  /**  CRC-16 value for FHCRC flag. */
  crc16!: number;
  /**  extra length. */
  xlen!: number;
  /**  CRC-32 value for verification. */
  crc32!: number;
  /** input size modulo 32 value. */
  isize!: number;
  /**  filename. */
  name!: string;
  /**  comment. */
  comment!: string;
  /** data */
  data!: Uint8Array;

  /** Get Name */
  getName(): string {
    return this.name;
  }

  /** Get Data */
  getData(): Uint8Array {
    return this.data;
  }

  /** Get MTime */
  getMtime(): Date {
    return this.mtime;
  }
}
