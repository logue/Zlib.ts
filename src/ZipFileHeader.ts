import {
  OperatingSystem,
  type OperatingSystemType,
} from './types/OperatingSystem';
import { ZipFlags, type ZipFlagsType } from './types/ZipFlags';

/** Zip File Header */
export default class ZipFileHeader {
  private input: Uint8Array;
  private offset: number;

  public length: number;
  public version: number;
  public os: OperatingSystemType;
  public needVersion: number;
  public flags: ZipFlagsType;
  public compression: number;
  public time: number;
  public date: number;
  public crc32: number;
  public compressedSize: number;
  public plainSize: number;
  private fileNameLength: number;
  private extraFieldLength: number;
  private fileCommentLength: number;
  public diskNumberStart: number;
  public internalFileAttributes: number;
  public externalFileAttributes: number;
  public relativeOffset: number;
  public filename: string;
  public extraField: Uint8Array;
  public comment: Uint8Array;

  static readonly FileHeaderSignature: number[] = [0x50, 0x4b, 0x01, 0x02];

  static readonly LocalFileHeaderSignature = [0x50, 0x4b, 0x03, 0x04];

  static readonly CentralDirectorySignature = [0x50, 0x4b, 0x05, 0x06];

  /**
   * @param input - input buffer.
   * @param  ip -input position.
   */
  constructor(input: Uint8Array, ip: number) {
    this.input = input;
    this.offset = ip;
    this.length = 0;
    this.version = 0;
    this.os = OperatingSystem.UNKNOWN;
    this.needVersion = 0;
    this.flags = ZipFlags.UNDEFINED;
    this.compression = 0;
    this.time = 0;
    this.date = 0;
    this.crc32 = 0;
    this.compressedSize = 0;
    this.plainSize = 0;
    this.fileNameLength = 0;
    this.extraFieldLength = 0;
    this.fileCommentLength = 0;
    this.diskNumberStart = 0;
    this.internalFileAttributes = 0;
    this.externalFileAttributes = 0;
    this.relativeOffset = 0;
    this.filename = '';
    this.extraField = new Uint8Array();
    this.comment = new Uint8Array();
  }

  /** Parse */
  parse() {
    const input: Uint8Array = this.input;
    let ip: number = this.offset;

    // central file header signature
    if (
      input[ip++] !== ZipFileHeader.FileHeaderSignature[0] ||
      input[ip++] !== ZipFileHeader.FileHeaderSignature[1] ||
      input[ip++] !== ZipFileHeader.FileHeaderSignature[2] ||
      input[ip++] !== ZipFileHeader.FileHeaderSignature[3]
    ) {
      throw new Error('invalid file header signature');
    }

    // version made by
    this.version = input[ip++];
    this.os = input[ip++];

    // version needed to extract
    this.needVersion = input[ip++] | (input[ip++] << 8);

    // general purpose bit flag
    this.flags = input[ip++] | (input[ip++] << 8);

    // compression method
    this.compression = input[ip++] | (input[ip++] << 8);

    // last mod file time
    this.time = input[ip++] | (input[ip++] << 8);

    // last mod file date
    this.date = input[ip++] | (input[ip++] << 8);

    // crc-32
    this.crc32 =
      (input[ip++] |
        (input[ip++] << 8) |
        (input[ip++] << 16) |
        (input[ip++] << 24)) >>>
      0;

    // compressed size
    this.compressedSize =
      (input[ip++] |
        (input[ip++] << 8) |
        (input[ip++] << 16) |
        (input[ip++] << 24)) >>>
      0;

    // uncompressed size
    this.plainSize =
      (input[ip++] |
        (input[ip++] << 8) |
        (input[ip++] << 16) |
        (input[ip++] << 24)) >>>
      0;

    // file name length
    this.fileNameLength = input[ip++] | (input[ip++] << 8);

    // extra field length
    this.extraFieldLength = input[ip++] | (input[ip++] << 8);

    // file comment length
    this.fileCommentLength = input[ip++] | (input[ip++] << 8);

    // disk number start
    this.diskNumberStart = input[ip++] | (input[ip++] << 8);

    // internal file attributes
    this.internalFileAttributes = input[ip++] | (input[ip++] << 8);

    // external file attributes
    this.externalFileAttributes =
      input[ip++] |
      (input[ip++] << 8) |
      (input[ip++] << 16) |
      (input[ip++] << 24);

    // relative offset of local header
    this.relativeOffset =
      (input[ip++] |
        (input[ip++] << 8) |
        (input[ip++] << 16) |
        (input[ip++] << 24)) >>>
      0;

    // file name
    this.filename = input.subarray(ip, (ip += this.fileNameLength)).toString();

    // extra field
    this.extraField = input.subarray(ip, (ip += this.extraFieldLength));

    // file comment
    this.comment = input.subarray(ip, ip + this.fileCommentLength);

    this.length = ip - this.offset;
  }
}
