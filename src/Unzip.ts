import CRC32 from './Crc32';
import type ZipOptionInterface from './interfaces/ZipOptionInterface';
import LocalFileHeader from './LocalFileHeader';
import RawInflate from './RawInflate';
import { CompressionMethod } from './types/CompressionMethod';
import { ZipFlags } from './types/ZipFlags';
import Zip from './Zip';
import ZipFileHeader from './ZipFileHeader';

/** Unzip */
export default class Unzip {
  private input: Uint8Array;
  private ip: number;
  private eocdrOffset: number;
  private numberOfThisDisk: number;
  private startDisk: number;
  private totalEntriesThisDisk: number;
  private totalEntries: number;
  private centralDirectorySize: number;
  private centralDirectoryOffset: number;
  private commentLength: number;
  private comment: Uint8Array;
  private fileHeaderList: ZipFileHeader[];
  private filenameToIndex: Record<string, number>;
  private verify: boolean;
  private password: Uint8Array;
  /**
   * @param  input - input buffer.
   * @param option - options.
   */
  constructor(input: Uint8Array, option: ZipOptionInterface) {
    this.input = new Uint8Array(input);
    this.ip = 0;
    this.eocdrOffset = 0;
    this.numberOfThisDisk = 0;
    this.startDisk = 0;
    this.totalEntriesThisDisk = 0;
    this.totalEntries = 0;
    this.centralDirectorySize = 0;
    this.centralDirectoryOffset = 0;
    this.commentLength = 0;
    this.comment = new Uint8Array();
    this.fileHeaderList = [];
    this.filenameToIndex = {};
    this.verify = option.verify || false;
    this.password = option.password || new Uint8Array();
  }

  /**
   * search End Of Central Directory Record
   */
  searchEndOfCentralDirectoryRecord() {
    const input: Uint8Array = this.input;
    let ip: number;

    for (ip = input.length - 12; ip > 0; --ip) {
      if (
        input[ip] === ZipFileHeader.CentralDirectorySignature[0] &&
        input[ip + 1] === ZipFileHeader.CentralDirectorySignature[1] &&
        input[ip + 2] === ZipFileHeader.CentralDirectorySignature[2] &&
        input[ip + 3] === ZipFileHeader.CentralDirectorySignature[3]
      ) {
        this.eocdrOffset = ip;
        return;
      }
    }

    throw new Error('End of Central Directory Record not found');
  }

  /**
   *
   */
  parseEndOfCentralDirectoryRecord() {
    const input: Uint8Array = this.input;

    if (!this.eocdrOffset) {
      this.searchEndOfCentralDirectoryRecord();
    }
    let ip: number = this.eocdrOffset;

    // signature
    if (
      input[ip++] !== ZipFileHeader.CentralDirectorySignature[0] ||
      input[ip++] !== ZipFileHeader.CentralDirectorySignature[1] ||
      input[ip++] !== ZipFileHeader.CentralDirectorySignature[2] ||
      input[ip++] !== ZipFileHeader.CentralDirectorySignature[3]
    ) {
      throw new Error('invalid signature');
    }

    // number of this disk
    this.numberOfThisDisk = input[ip++] | (input[ip++] << 8);

    // number of the disk with the start of the central directory
    this.startDisk = input[ip++] | (input[ip++] << 8);

    // total number of entries in the central directory on this disk
    this.totalEntriesThisDisk = input[ip++] | (input[ip++] << 8);

    // total number of entries in the central directory
    this.totalEntries = input[ip++] | (input[ip++] << 8);

    // size of the central directory
    this.centralDirectorySize =
      (input[ip++] |
        (input[ip++] << 8) |
        (input[ip++] << 16) |
        (input[ip++] << 24)) >>>
      0;

    // offset of start of central directory with respect to the starting disk number
    this.centralDirectoryOffset =
      (input[ip++] |
        (input[ip++] << 8) |
        (input[ip++] << 16) |
        (input[ip++] << 24)) >>>
      0;

    // .ZIP file comment length
    this.commentLength = input[ip++] | (input[ip++] << 8);

    // .ZIP file comment
    this.comment = input.subarray(ip, ip + this.commentLength);
  }

  /**
   * parseFileHeader
   */
  parseFileHeader() {
    const filelist: ZipFileHeader[] = [];
    const filetable: Record<string, number> = {};
    let ip: number;
    let fileHeader: ZipFileHeader;
    let i: number;
    let il: number;

    if (this.fileHeaderList) {
      return;
    }

    if (this.centralDirectoryOffset === void 0) {
      this.parseEndOfCentralDirectoryRecord();
    }
    ip = this.centralDirectoryOffset;

    for (i = 0, il = this.totalEntries; i < il; ++i) {
      fileHeader = new ZipFileHeader(this.input, ip);
      fileHeader.parse();
      ip += fileHeader.length;
      filelist[i] = fileHeader;
      filetable[fileHeader.filename] = i;
    }

    if (this.centralDirectorySize < ip - this.centralDirectoryOffset) {
      throw new Error('invalid file header size');
    }

    this.fileHeaderList = filelist;
    this.filenameToIndex = filetable;
  }

  /**
   * file data.
   *
   * @param index - file header index.
   * @param option -
   */
  getFileData(index: number, option: { password: Uint8Array }): Uint8Array {
    const input: Uint8Array = this.input;
    const fileHeaderList: ZipFileHeader[] = this.fileHeaderList;
    let offset: number;
    let length: number;
    let buffer: Uint8Array;
    let crc32: number;
    let key: Uint32Array;
    let i: number;
    let il: number;

    if (!fileHeaderList) {
      this.parseFileHeader();
    }

    if (fileHeaderList[index] === void 0) {
      throw new Error('wrong index');
    }

    offset = fileHeaderList[index].relativeOffset;
    const localFileHeader = new LocalFileHeader(this.input, offset);
    localFileHeader.parse();
    offset += localFileHeader.length;
    length = localFileHeader.compressedSize;

    // decryption
    if ((localFileHeader.flags & ZipFlags.ENCRYPT) !== 0) {
      if (!(option.password || this.password)) {
        throw new Error('please set password');
      }
      key = this.createDecryptionKey(option.password || this.password);

      // encryption header
      for (i = offset, il = offset + 12; i < il; ++i) {
        this.decode(key, input[i]);
      }
      offset += 12;
      length -= 12;

      // decryption
      for (i = offset, il = offset + length; i < il; ++i) {
        input[i] = this.decode(key, input[i]);
      }
    }

    switch (localFileHeader.compression) {
      case CompressionMethod.STORE:
        buffer = this.input.subarray(offset, offset + length);
        break;
      case CompressionMethod.DEFLATE:
        buffer = new RawInflate(this.input, {
          index: offset,
          bufferSize: localFileHeader.plainSize,
        }).decompress();
        break;
      default:
        throw new Error('unknown compression type');
    }

    if (this.verify) {
      crc32 = CRC32.calc(buffer);
      if (localFileHeader.crc32 !== crc32) {
        throw new Error(
          'wrong crc: file=0x' +
            localFileHeader.crc32.toString(16) +
            ', data=0x' +
            crc32.toString(16)
        );
      }
    }

    return buffer;
  }

  /**
   * getFilenames
   */
  getFilenames(): string[] {
    const filenameList: string[] = [];
    let i: number;
    let il: number;

    if (!this.fileHeaderList) {
      this.parseFileHeader();
    }
    const fileHeaderList: ZipFileHeader[] = this.fileHeaderList;

    for (i = 0, il = fileHeaderList.length; i < il; ++i) {
      filenameList[i] = fileHeaderList[i].filename;
    }

    return filenameList;
  }

  /**
   * Get decompressed data.
   *
   * @param  filename - extract filename.
   * @param  option -
   */
  decompress(filename: string, option: { password: Uint8Array }): Uint8Array {
    if (!this.filenameToIndex) {
      this.parseFileHeader();
    }
    const index: number = this.filenameToIndex[filename];

    if (index === void 0) {
      throw new Error(filename + ' not found');
    }

    return this.getFileData(index, option);
  }

  /**
   * @param password -
   */
  setPassword(password: Uint8Array) {
    this.password = password;
  }

  /**
   * @param key -
   * @param  n -
   */
  decode(key: Uint32Array, n: number): number {
    n ^= this.getByte(key);
    this.updateKeys(key, n);

    return n;
  }

  // common method
  updateKeys = Zip.prototype.updateKeys;
  createDecryptionKey = Zip.prototype.createEncryptionKey;
  getByte = Zip.prototype.getByte;

  // end of scope
}
