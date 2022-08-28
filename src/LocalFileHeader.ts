import { ZipFlags, type ZipFlagsType } from './types/ZipFlags';
import ZipFileHeader from './ZipFileHeader';

/** Local File Header */
export default class LocalFileHeader {
  private input: Uint8Array;
  private offset: number;
  public length: number;
  public needVersion: number;
  public flags: ZipFlagsType;
  public compression: number;
  public time: number;
  public date: number;
  public crc32: number;
  public compressedSize: number;
  public plainSize: number;
  public fileNameLength: number;
  public extraFieldLength: number;
  public filename: string;
  public extraField: Uint8Array;
  /**
   * @param input - input buffer.
   * @param ip - input position.
   */
  constructor(input: Uint8Array, ip: number) {
    this.input = input;
    this.offset = ip;
    this.length = 0;
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
    this.filename = '';
    this.extraField = new Uint8Array();
  }

  /** Parse */
  parse() {
    const input: Uint8Array = this.input;
    let ip: number = this.offset;

    // local file header signature
    if (
      input[ip++] !== ZipFileHeader.LocalFileHeaderSignature[0] ||
      input[ip++] !== ZipFileHeader.LocalFileHeaderSignature[1] ||
      input[ip++] !== ZipFileHeader.LocalFileHeaderSignature[2] ||
      input[ip++] !== ZipFileHeader.LocalFileHeaderSignature[3]
    ) {
      throw new Error('invalid local file header signature');
    }

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

    // file name
    this.filename = input.subarray(ip, (ip += this.fileNameLength)).toString();

    // extra field
    this.extraField = input.subarray(ip, (ip += this.extraFieldLength));
    this.length = ip - this.offset;
  }
}
