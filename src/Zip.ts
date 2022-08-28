import CRC32 from './Crc32';
import type FileInterface from './interfaces/FileInterface';
import type ZipOptionInterface from './interfaces/ZipOptionInterface';
import RawDeflate from './RawDeflate';
import {
  CompressionMethod,
  type CompressionMethodType,
} from './types/CompressionMethod';
import { OperatingSystem } from './types/OperatingSystem';
import { ZipFlags } from './types/ZipFlags';
import ZipFileHeader from './ZipFileHeader';

/** Zip Class */
export default class Zip {
  private files: FileInterface[];
  private comment: Uint8Array;
  private password: Uint8Array;

  /**
   * @param option - options.
   */
  constructor(option: ZipOptionInterface) {
    this.files = [];
    this.comment = option.comment || new Uint8Array();
    this.password = new Uint8Array();
  }

  /**
   * @param input -
   * @param option - options.
   */
  addFile(input: Uint8Array, option: ZipOptionInterface) {
    let compressed: boolean = false;
    const size: number = input.length;
    let crc32: number = 0;

    // default
    option.compressionMethod = CompressionMethod.DEFLATE;

    // その場で圧縮する場合
    if (option.compress) {
      switch (option.compressionMethod) {
        case CompressionMethod.STORE:
          break;
        case CompressionMethod.DEFLATE:
          crc32 = CRC32.calc(input);
          input = this.deflateWithOption(input, option);
          compressed = true;
          break;
        default:
          throw new Error(
            'unknown compression method:' + option.compressionMethod
          );
      }
    }

    this.files.push({
      buffer: input,
      option: option,
      compressed: compressed,
      encrypted: false,
      size: size,
      crc32: crc32,
    });
  }

  /**
   * @param password -
   */
  setPassword(password: Uint8Array) {
    this.password = password;
  }

  /** Compress */
  compress() {
    const files: FileInterface[] = this.files;
    let file: FileInterface;
    let op1: number;
    let op2: number;
    let op3: number;
    let localFileSize: number = 0;
    let centralDirectorySize: number = 0;
    let offset: number;
    let needVersion: number;
    let flags: number;
    let compressionMethod: CompressionMethodType;
    let date: Date;
    let crc32: number;
    let size: number;
    let plainSize: number;
    let filenameLength: number;
    let extraFieldLength: number;
    let commentLength: number;
    let filename: Uint8Array;
    let extraField: Uint8Array;
    let comment: Uint8Array;
    let buffer: Uint8Array;
    let tmp;
    let key: Uint32Array;
    let i: number;
    let il: number;
    let j;
    let jl: number;

    // ファイルの圧縮
    for (i = 0, il = files.length; i < il; ++i) {
      file = files[i];
      filenameLength = file.option.filename ? file.option.filename.length : 0;
      extraFieldLength = file.option.extraField
        ? file.option.extraField.length
        : 0;
      commentLength = file.option.comment ? file.option.comment.length : 0;

      // 圧縮されていなかったら圧縮
      if (!file.compressed) {
        // 圧縮前に CRC32 の計算をしておく
        file.crc32 = CRC32.calc(file.buffer);

        switch (file.option['compressionMethod']) {
          case CompressionMethod.STORE:
            break;
          case CompressionMethod.DEFLATE:
            file.buffer = this.deflateWithOption(file.buffer, file.option);
            file.compressed = true;
            break;
          default:
            throw new Error(
              'unknown compression method:' + file.option['compressionMethod']
            );
        }
      }

      // encryption
      if (file.option.password !== void 0 || this.password !== void 0) {
        // init encryption
        key = this.createEncryptionKey(file.option.password || this.password);

        // add header
        buffer = file.buffer;

        tmp = new Uint8Array(buffer.length + 12);
        tmp.set(buffer, 12);
        buffer = tmp;

        for (j = 0; j < 12; ++j) {
          buffer[j] = this.encode(
            key,
            i === 11 ? file.crc32 & 0xff : (Math.random() * 256) | 0
          );
        }

        // data encryption
        for (jl = buffer.length; j < jl; ++j) {
          buffer[j] = this.encode(key, buffer[j]);
        }
        file.buffer = buffer;
      }

      // 必要バッファサイズの計算
      localFileSize +=
        // local file header
        30 +
        filenameLength +
        // file data
        file.buffer.length;

      centralDirectorySize +=
        // file header
        46 + filenameLength + commentLength;
    }

    // end of central directory
    // zlib.js 0.2.0のzip.js/zip.min.jsのバグの修正[ZIPファイルの破損]
    // http://www.petitmonte.com/javascript/zip_js_error.html
    const endOfCentralDirectorySize: number =
      22 + (this.comment ? this.comment.length : 0);
    const output: Uint8Array = new Uint8Array(
      localFileSize + centralDirectorySize + endOfCentralDirectorySize
    );
    op1 = 0;
    op2 = localFileSize;
    op3 = op2 + centralDirectorySize;

    // ファイルの圧縮
    for (i = 0, il = files.length; i < il; ++i) {
      file = files[i];
      filenameLength = file.option.filename ? file.option.filename.length : 0;
      extraFieldLength = 0; // TODO
      commentLength = file.option.comment ? file.option.comment.length : 0;

      // -------------------------------------------------------------------------
      // local file header & file header
      // -------------------------------------------------------------------------

      offset = op1;

      // signature
      // local file header
      output[op1++] = ZipFileHeader.LocalFileHeaderSignature[0];
      output[op1++] = ZipFileHeader.LocalFileHeaderSignature[1];
      output[op1++] = ZipFileHeader.LocalFileHeaderSignature[2];
      output[op1++] = ZipFileHeader.LocalFileHeaderSignature[3];
      // file header
      output[op2++] = ZipFileHeader.FileHeaderSignature[0];
      output[op2++] = ZipFileHeader.FileHeaderSignature[1];
      output[op2++] = ZipFileHeader.FileHeaderSignature[2];
      output[op2++] = ZipFileHeader.FileHeaderSignature[3];

      // compressor info
      needVersion = 20;
      output[op2++] = needVersion & 0xff;
      output[op2++] = file.option.os || OperatingSystem.MSDOS;

      // need version
      output[op1++] = output[op2++] = needVersion & 0xff;
      output[op1++] = output[op2++] = (needVersion >> 8) & 0xff;

      // general purpose bit flag
      flags = 0;
      if (file.option.password || this.password) {
        flags |= ZipFlags.ENCRYPT;
      }
      output[op1++] = output[op2++] = flags & 0xff;
      output[op1++] = output[op2++] = (flags >> 8) & 0xff;

      // compression method
      compressionMethod = file.option.compressionMethod;
      output[op1++] = output[op2++] = compressionMethod & 0xff;
      output[op1++] = output[op2++] = (compressionMethod >> 8) & 0xff;

      // date
      date = file.option.date || new Date();
      output[op1++] = output[op2++] =
        ((date.getMinutes() & 0x7) << 5) | ((date.getSeconds() / 2) | 0);
      output[op1++] = output[op2++] =
        (date.getHours() << 3) | (date.getMinutes() >> 3);
      //
      output[op1++] = output[op2++] =
        (((date.getMonth() + 1) & 0x7) << 5) | date.getDate();
      output[op1++] = output[op2++] =
        (((date.getFullYear() - 1980) & 0x7f) << 1) |
        ((date.getMonth() + 1) >> 3);

      // CRC-32
      crc32 = file.crc32;
      output[op1++] = output[op2++] = crc32 & 0xff;
      output[op1++] = output[op2++] = (crc32 >> 8) & 0xff;
      output[op1++] = output[op2++] = (crc32 >> 16) & 0xff;
      output[op1++] = output[op2++] = (crc32 >> 24) & 0xff;

      // compressed size
      size = file.buffer.length;
      output[op1++] = output[op2++] = size & 0xff;
      output[op1++] = output[op2++] = (size >> 8) & 0xff;
      output[op1++] = output[op2++] = (size >> 16) & 0xff;
      output[op1++] = output[op2++] = (size >> 24) & 0xff;

      // uncompressed size
      plainSize = file.size;
      output[op1++] = output[op2++] = plainSize & 0xff;
      output[op1++] = output[op2++] = (plainSize >> 8) & 0xff;
      output[op1++] = output[op2++] = (plainSize >> 16) & 0xff;
      output[op1++] = output[op2++] = (plainSize >> 24) & 0xff;

      // filename length
      output[op1++] = output[op2++] = filenameLength & 0xff;
      output[op1++] = output[op2++] = (filenameLength >> 8) & 0xff;

      // extra field length
      output[op1++] = output[op2++] = extraFieldLength & 0xff;
      output[op1++] = output[op2++] = (extraFieldLength >> 8) & 0xff;

      // file comment length
      output[op2++] = commentLength & 0xff;
      output[op2++] = (commentLength >> 8) & 0xff;

      // disk number start
      output[op2++] = 0;
      output[op2++] = 0;

      // internal file attributes
      output[op2++] = 0;
      output[op2++] = 0;

      // external file attributes
      output[op2++] = 0;
      output[op2++] = 0;
      output[op2++] = 0;
      output[op2++] = 0;

      // relative offset of local header
      output[op2++] = offset & 0xff;
      output[op2++] = (offset >> 8) & 0xff;
      output[op2++] = (offset >> 16) & 0xff;
      output[op2++] = (offset >> 24) & 0xff;

      // filename
      filename = file.option.filename;
      if (filename) {
        output.set(filename, op1);
        output.set(filename, op2);
        op1 += filenameLength;
        op2 += filenameLength;
      }

      // extra field
      extraField = file.option.extraField;
      if (extraField) {
        output.set(extraField, op1);
        output.set(extraField, op2);
        op1 += extraFieldLength;
        op2 += extraFieldLength;
      }

      // comment
      comment = file.option.comment;
      if (comment) {
        output.set(comment, op2);
        op2 += commentLength;
      }

      // -------------------------------------------------------------------------
      // file data
      // -------------------------------------------------------------------------

      output.set(file.buffer, op1);
      op1 += file.buffer.length;
    }

    // -------------------------------------------------------------------------
    // end of central directory
    // -------------------------------------------------------------------------

    // signature
    output[op3++] = ZipFileHeader.CentralDirectorySignature[0];
    output[op3++] = ZipFileHeader.CentralDirectorySignature[1];
    output[op3++] = ZipFileHeader.CentralDirectorySignature[2];
    output[op3++] = ZipFileHeader.CentralDirectorySignature[3];

    // number of this disk
    output[op3++] = 0;
    output[op3++] = 0;

    // number of the disk with the start of the central directory
    output[op3++] = 0;
    output[op3++] = 0;

    // total number of entries in the central directory on this disk
    output[op3++] = il & 0xff;
    output[op3++] = (il >> 8) & 0xff;

    // total number of entries in the central directory
    output[op3++] = il & 0xff;
    output[op3++] = (il >> 8) & 0xff;

    // size of the central directory
    output[op3++] = centralDirectorySize & 0xff;
    output[op3++] = (centralDirectorySize >> 8) & 0xff;
    output[op3++] = (centralDirectorySize >> 16) & 0xff;
    output[op3++] = (centralDirectorySize >> 24) & 0xff;

    // offset of start of central directory with respect to the starting disk number
    output[op3++] = localFileSize & 0xff;
    output[op3++] = (localFileSize >> 8) & 0xff;
    output[op3++] = (localFileSize >> 16) & 0xff;
    output[op3++] = (localFileSize >> 24) & 0xff;

    // .ZIP file comment length
    commentLength = this.comment ? this.comment.length : 0;
    output[op3++] = commentLength & 0xff;
    output[op3++] = (commentLength >> 8) & 0xff;

    // .ZIP file comment
    if (this.comment) {
      output.set(this.comment, op3);
      op3 += commentLength;
    }

    return output;
  }

  /**
   * @param input -
   * @param optParams - options.
   */
  deflateWithOption(input: Uint8Array, option: ZipOptionInterface): Uint8Array {
    const deflator = new RawDeflate(input, option.deflateOption);
    return deflator.compress();
  }

  /**
   * @param key -
   */
  getByte(key: Uint32Array): number {
    const tmp: number = (key[2] & 0xffff) | 2;

    return ((tmp * (tmp ^ 1)) >> 8) & 0xff;
  }

  /**
   * @param  key -
   * @param  n  -
   */
  encode(key: number[] | Uint32Array, n: number): number {
    const tmp: number = this.getByte(key as Uint32Array);

    this.updateKeys(key, n);

    return tmp ^ n;
  }

  /**
   * @param key -
   * @param n -
   */
  updateKeys(key: Uint32Array | number[], n: number) {
    key[0] = CRC32.single(key[0], n);
    key[1] =
      ((((((key[1] + (key[0] & 0xff)) * 20173) >>> 0) * 6681) >>> 0) + 1) >>> 0;
    key[2] = CRC32.single(key[2], key[1] >>> 24);
  }

  /**
   * @param password -
   */
  createEncryptionKey(password: Uint8Array): Uint32Array {
    const key: Uint32Array = new Uint32Array([305419896, 591751049, 878082192]);
    let i: number;
    let il: number;

    for (i = 0, il = password.length; i < il; ++i) {
      this.updateKeys(key, password[i] & 0xff);
    }

    return key;
  }
}
