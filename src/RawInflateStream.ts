import Huffman from './Huffman';
import { BlockType, type BlockTypeType } from './types/BlockType';
import { Status, type StatusType } from './types/Status';

// -----------------------------------------------------------------------------
/** buffer block size. */
const ZLIB_STREAM_RAW_INFLATE_BUFFER_SIZE: number = 0x8000;
const buildHuffmanTable = Huffman.buildHuffmanTable;
// -----------------------------------------------------------------------------

/**
 * Raw Infrate Stream class
 */
export default class RawInflateStream {
  private blocks: Uint8Array;
  /** block size. */
  private bufferSize: number;
  /** total output buffer pointer. */
  private totalpos: number;
  /** input buffer pointer. */
  public ip: number;
  /** bit stream reader buffer. */
  private bitsbuf: number;
  /** bit stream reader buffer size. */
  private bitsbuflen: number;
  /** input buffer. */
  private input: Uint8Array;
  /**  output buffer. */
  public output: Uint8Array;
  /**  output buffer pointer. */
  private op: number;
  /** is final block flag. */
  private bfinal = false;
  /**  uncompressed block length. */
  private blockLength: number;
  /** resize flag for memory size optimization. */
  private resize: boolean;
  private litlenTable: any[];
  private distTable: any[];
  /** stream pointer */
  private sp: number = 0; //
  private status: StatusType;
  /** previous RLE value */
  private prev: number;

  private currentBlockType: BlockTypeType;

  // backup
  private ip_: number;
  private bitsbuf_: number;
  private bitsbuflen_: number;
  /**
   * @param  input - input buffer.
   * @param ip - input buffer pointer.
   * @param buffersize -  buffer block size.
   */
  constructor(input: Uint8Array, ip: number, buffersize?: number) {
    this.blocks = new Uint8Array();
    this.bufferSize = buffersize
      ? buffersize
      : ZLIB_STREAM_RAW_INFLATE_BUFFER_SIZE;
    this.totalpos = 0;
    this.ip = ip === void 0 ? 0 : ip;
    this.bitsbuf = 0;
    this.bitsbuflen = 0;
    this.input = new Uint8Array(input);
    this.output = new Uint8Array(this.bufferSize);
    this.op = 0;
    this.bfinal = false;
    this.blockLength = 0;
    this.resize = false;
    this.litlenTable = [];
    this.distTable = [];
    this.status = Status.INITIALIZED;
    this.currentBlockType = BlockType.UNCOMPRESSED;
    this.prev = 0;

    //
    // backup
    //
    this.ip_ = 0;
    this.bitsbuflen_ = 0;
    this.bitsbuf_ = 0;
  }

  /**
   * decompress.
   */
  decompress(newInput: Uint8Array, ip: number | undefined): Uint8Array {
    let stop: boolean = false;

    if (newInput !== void 0) {
      this.input = newInput;
    }

    if (ip !== void 0) {
      this.ip = ip;
    }

    if (
      this.output.length > 4 * RawInflateStream.MaxBackwardLength &&
      this.sp > this.output.length >>> 1
    ) {
      // we may face the end of the buffer very soon so probably it's better
      // to move the backward area to the beginning already or otherwise
      // soon we will move the same area plus large inflated data
      this.rewindOutputBuffer();
    }

    // decompress
    while (!stop) {
      switch (this.status) {
        // block header
        case Status.INITIALIZED:
        case Status.BLOCK_HEADER_START:
          if (this.readBlockHeader() < 0) {
            stop = true;
          }
          break;
        // block body
        case Status.BLOCK_HEADER_END: /* FALLTHROUGH */
        case Status.BLOCK_BODY_START:
          switch (this.currentBlockType) {
            case BlockType.UNCOMPRESSED:
              if (this.readUncompressedBlockHeader() < 0) {
                stop = true;
              }
              break;
            case BlockType.FIXED:
              if (this.parseFixedHuffmanBlock() < 0) {
                stop = true;
              }
              break;
            case BlockType.DYNAMIC:
              if (this.parseDynamicHuffmanBlock() < 0) {
                stop = true;
              }
              break;
          }
          break;
        // decode data
        case Status.BLOCK_BODY_END:
        case Status.DECODE_BLOCK_START:
          switch (this.currentBlockType) {
            case BlockType.UNCOMPRESSED:
              if (this.parseUncompressedBlock() < 0) {
                stop = true;
              }
              break;
            case BlockType.FIXED: /* FALLTHROUGH */
            case BlockType.DYNAMIC:
              if (this.decodeHuffman() < 0) {
                stop = true;
              }
              break;
          }
          break;
        case Status.DECODE_BLOCK_END:
          if (this.bfinal) {
            stop = true;
          } else {
            this.status = Status.INITIALIZED;
          }
          break;
      }
    }

    return this.concatBuffer();
  }

  /**
   *  max backward length for LZ77.
   */
  static MaxBackwardLength: number = 32768;

  /**
   *  max copy length for LZ77.
   */
  static MaxCopyLength: number = 258;

  /**
   * huffman order
   */
  static Order: Uint8Array = (table => {
    return new Uint8Array(table);
  })([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);

  /**
   * huffman length code table.
   */
  static LengthCodeTable: Uint16Array = ((table: number[]) => {
    return new Uint16Array(table);
  })([
    0x0003, 0x0004, 0x0005, 0x0006, 0x0007, 0x0008, 0x0009, 0x000a, 0x000b,
    0x000d, 0x000f, 0x0011, 0x0013, 0x0017, 0x001b, 0x001f, 0x0023, 0x002b,
    0x0033, 0x003b, 0x0043, 0x0053, 0x0063, 0x0073, 0x0083, 0x00a3, 0x00c3,
    0x00e3, 0x0102, 0x0102, 0x0102,
  ]);

  /**
   * huffman length extra-bits table.
   */
  static LengthExtraTable: Uint8Array = ((table: number[]) => {
    return new Uint8Array(table);
  })([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5,
    5, 5, 5, 0, 0, 0,
  ]);

  /**
   * huffman dist code table.
   */
  static DistCodeTable: Uint16Array = ((table: number[]) => {
    return new Uint16Array(table);
  })([
    0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0007, 0x0009, 0x000d, 0x0011,
    0x0019, 0x0021, 0x0031, 0x0041, 0x0061, 0x0081, 0x00c1, 0x0101, 0x0181,
    0x0201, 0x0301, 0x0401, 0x0601, 0x0801, 0x0c01, 0x1001, 0x1801, 0x2001,
    0x3001, 0x4001, 0x6001,
  ]);

  /**
   * huffman dist extra-bits table.
   */
  static DistExtraTable: Uint8Array = ((table: number[]) => {
    return new Uint8Array(table);
  })([
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
    11, 11, 12, 12, 13, 13,
  ]);

  /**
   * fixed huffman length code table
   */
  static FixedLiteralLengthTable: [Uint32Array, number, number] = (table => {
    return table;
  })(
    (() => {
      const lengths = new Uint8Array(288);
      let i: number;
      let il: number;

      for (i = 0, il = lengths.length; i < il; ++i) {
        lengths[i] = i <= 143 ? 8 : i <= 255 ? 9 : i <= 279 ? 7 : 8;
      }

      return buildHuffmanTable(lengths);
    })()
  );

  /**
   * fixed huffman distance code table
   */
  static FixedDistanceTable: [Uint32Array, number, number] = (table => {
    return table;
  })(
    (() => {
      const lengths = new Uint8Array(30);
      let i: number;
      let il: number;

      for (i = 0, il = lengths.length; i < il; ++i) {
        lengths[i] = 5;
      }

      return buildHuffmanTable(lengths);
    })()
  );

  /**
   * parse deflated block.
   */
  readBlockHeader(): number {
    /** header */
    let hdr: number;

    this.status = Status.BLOCK_HEADER_START;

    this.save_();
    if ((hdr = this.readBits(3)) < 0) {
      this.restore_();
      return -1;
    }

    // BFINAL
    if (hdr & 0x1) {
      this.bfinal = true;
    }

    // BTYPE
    hdr >>>= 1;
    switch (hdr) {
      case 0: // uncompressed
        this.currentBlockType = BlockType.UNCOMPRESSED;
        break;
      case 1: // fixed huffman
        this.currentBlockType = BlockType.FIXED;
        break;
      case 2: // dynamic huffman
        this.currentBlockType = BlockType.DYNAMIC;
        break;
      default: // reserved or other
        throw new Error('unknown BTYPE: ' + hdr);
    }

    this.status = Status.BLOCK_HEADER_END;
    return 0;
  }

  /**
   * read inflate bits
   *
   * @param length - bits length.
   */
  readBits(length: number): number {
    let bitsbuf = this.bitsbuf;
    let bitsbuflen = this.bitsbuflen;
    const input = this.input;
    let ip = this.ip;

    /** input and output byte. */
    let octet: number;

    // not enough buffer
    while (bitsbuflen < length) {
      // input byte
      if (input.length <= ip) {
        return -1;
      }
      octet = input[ip++];

      // concat octet
      bitsbuf |= octet << bitsbuflen;
      bitsbuflen += 8;
    }

    // output byte
    octet = bitsbuf & /* MASK */ ((1 << length) - 1);
    bitsbuf >>>= length;
    bitsbuflen -= length;

    this.bitsbuf = bitsbuf;
    this.bitsbuflen = bitsbuflen;
    this.ip = ip;

    return octet;
  }

  /**
   * read huffman code using table
   *
   * @param  table - huffman code table.
   */
  readCodeByTable(table: any[]): number {
    let bitsbuf = this.bitsbuf;
    let bitsbuflen = this.bitsbuflen;
    const input = this.input;
    let ip = this.ip;

    /** huffman code table */
    const codeTable: Uint8Array = table[0];
    const maxCodeLength: number = table[1];
    /**  input byte */
    let octet: number;

    // not enough buffer
    while (bitsbuflen < maxCodeLength) {
      if (input.length <= ip) {
        return -1;
      }
      octet = input[ip++];
      bitsbuf |= octet << bitsbuflen;
      bitsbuflen += 8;
    }

    // read max length
    /**  code length & code (16bit, 16bit) */
    const codeWithLength: number =
      codeTable[bitsbuf & ((1 << maxCodeLength) - 1)];
    /** code bits length */
    const codeLength: number = codeWithLength >>> 16;

    this.bitsbuf = bitsbuf >> codeLength;
    this.bitsbuflen = bitsbuflen - codeLength;
    this.ip = ip;

    return codeWithLength & 0xffff;
  }

  /**
   * read uncompressed block header
   */
  readUncompressedBlockHeader() {
    const input = this.input;
    let ip = this.ip;

    this.status = Status.BLOCK_BODY_START;

    if (ip + 4 >= input.length) {
      return -1;
    }

    /**  block length */
    const len: number = input[ip++] | (input[ip++] << 8);
    /** number for check block length */
    const nlen: number = input[ip++] | (input[ip++] << 8);

    // check len & nlen
    if (len === ~nlen) {
      throw new Error('invalid uncompressed block header: length verify');
    }

    // skip buffered header bits
    this.bitsbuf = 0;
    this.bitsbuflen = 0;

    this.ip = ip;
    this.blockLength = len;
    this.status = Status.BLOCK_BODY_END;
    return 0;
  }

  /**
   * parse uncompressed block.
   */
  parseUncompressedBlock() {
    const input = this.input;
    let ip = this.ip;
    let output = this.output;
    let op = this.op;
    let len = this.blockLength;

    this.status = Status.DECODE_BLOCK_START;

    // copy
    // XXX: とりあえず素直にコピー
    while (len--) {
      if (op === output.length) {
        this.op = op;
        output = this.expandBuffer({ fixRatio: 2 });
        op = this.op;
      }

      // not enough input buffer
      if (ip >= input.length) {
        this.ip = ip;
        this.op = op;
        this.blockLength = len + 1; // コピーしてないので戻す
        return -1;
      }

      output[op++] = input[ip++];
    }

    if (len < 0) {
      this.status = Status.DECODE_BLOCK_END;
    }

    this.ip = ip;
    this.op = op;

    return 0;
  }

  /**
   * parse fixed huffman block.
   */
  parseFixedHuffmanBlock() {
    this.status = Status.BLOCK_BODY_START;

    this.litlenTable = RawInflateStream.FixedLiteralLengthTable;
    this.distTable = RawInflateStream.FixedDistanceTable;

    this.status = Status.BLOCK_BODY_END;

    return 0;
  }

  /**
   * オブジェクトのコンテキストを別のプロパティに退避する.
   */
  private save_() {
    this.ip_ = this.ip;
    this.bitsbuflen_ = this.bitsbuflen;
    this.bitsbuf_ = this.bitsbuf;
  }

  /**
   * 別のプロパティに退避したコンテキストを復元する.
   */
  private restore_() {
    this.ip = this.ip_;
    this.bitsbuflen = this.bitsbuflen_;
    this.bitsbuf = this.bitsbuf_;
  }

  /**
   * parse dynamic huffman block.
   */
  parseDynamicHuffmanBlock() {
    /**  code lengths. */
    const codeLengths: Uint8Array = new Uint8Array(
      RawInflateStream.Order.length
    );
    /** code lengths table. */
    let codeLengthsTable: [Uint32Array, number, number];
    /**  literal and length code lengths. */
    let litlenLengths: Uint8Array;
    /** distance code lengths. */
    let distLengths: Uint8Array;
    /** loop counter. */
    let i: number = 0;

    this.status = Status.BLOCK_BODY_START;

    this.save_();

    /** number of literal and length codes. */
    const hlit: number = this.readBits(5) + 257;
    /** number of distance codes. */
    const hdist: number = this.readBits(5) + 1;
    /**  number of code lengths. */
    const hclen: number = this.readBits(4) + 4;

    if (hlit < 0 || hdist < 0 || hclen < 0) {
      this.restore_();
      return -1;
    }

    /**
     * Dynamic Huffman Block
     */
    const parseDynamicHuffmanBlockImpl = () => {
      let bits: number;

      // decode code lengths
      for (i = 0; i < hclen; ++i) {
        if ((bits = this.readBits(3)) < 0) {
          throw new Error('not enough input');
        }
        codeLengths[RawInflateStream.Order[i]] = bits;
      }
      codeLengthsTable = buildHuffmanTable(codeLengths);

      // decode function
      const decode = (num: number, table: any, lengths: Uint8Array) => {
        let code: number;
        let prev = this.prev;
        let repeat: number;
        let bits: number;

        for (let j: number = 0; j < num; ) {
          code = this.readCodeByTable(table);
          if (code < 0) {
            throw new Error('not enough input');
          }
          switch (code) {
            case 16:
              if ((bits = this.readBits(2)) < 0) {
                throw new Error('not enough input');
              }
              repeat = 3 + bits;
              while (repeat--) {
                lengths[j++] = prev;
              }
              break;
            case 17:
              if ((bits = this.readBits(3)) < 0) {
                throw new Error('not enough input');
              }
              repeat = 3 + bits;
              while (repeat--) {
                lengths[j++] = 0;
              }
              prev = 0;
              break;
            case 18:
              if ((bits = this.readBits(7)) < 0) {
                throw new Error('not enough input');
              }
              repeat = 11 + bits;
              while (repeat--) {
                lengths[j++] = 0;
              }
              prev = 0;
              break;
            default:
              lengths[j++] = code;
              prev = code;
              break;
          }
        }

        this.prev = prev;

        return lengths;
      };

      // literal and length code
      litlenLengths = new Uint8Array(hlit);

      // distance code
      distLengths = new Uint8Array(hdist);

      this.prev = 0;
      this.litlenTable = buildHuffmanTable(
        decode.call(this, hlit, codeLengthsTable, litlenLengths)
      );
      this.distTable = buildHuffmanTable(
        decode.call(this, hdist, codeLengthsTable, distLengths)
      );
    };

    try {
      parseDynamicHuffmanBlockImpl.call(this);
    } catch (e) {
      this.restore_();
      return -1;
    }

    this.status = Status.BLOCK_BODY_END;

    return 0;
  }

  /**
   * decode huffman code (dynamic)
   */
  decodeHuffman(): number {
    let output = this.output;
    let op = this.op;

    /**  huffman code. */
    let code: number;
    /**  table index. */
    let ti: number;
    /**  huffman code distination. */
    let codeDist: number;
    /** huffman code length. */
    let codeLength: number;

    const litlen = this.litlenTable;
    const dist = this.distTable;

    let olength = output.length;
    let bits: number;

    this.status = Status.DECODE_BLOCK_START;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.save_();

      code = this.readCodeByTable(litlen);
      if (code < 0) {
        this.op = op;
        this.restore_();
        return -1;
      }

      if (code === 256) {
        break;
      }

      // literal
      if (code < 256) {
        if (op === olength) {
          this.op = op;
          output = this.expandBuffer();
          op = this.op;
          olength = output.length;
        }
        output[op++] = code;

        continue;
      }

      // length code
      ti = code - 257;
      codeLength = RawInflateStream.LengthCodeTable[ti];
      if (RawInflateStream.LengthExtraTable[ti] > 0) {
        bits = this.readBits(RawInflateStream.LengthExtraTable[ti]);
        if (bits < 0) {
          this.op = op;
          this.restore_();
          return -1;
        }
        codeLength += bits;
      }

      // dist code
      code = this.readCodeByTable(dist);
      if (code < 0) {
        this.op = op;
        this.restore_();
        return -1;
      }
      codeDist = RawInflateStream.DistCodeTable[code];
      if (RawInflateStream.DistExtraTable[code] > 0) {
        bits = this.readBits(RawInflateStream.DistExtraTable[code]);
        if (bits < 0) {
          this.op = op;
          this.restore_();
          return -1;
        }
        codeDist += bits;
      }

      // lz77 decode
      while (op + codeLength >= olength) {
        this.op = op;
        output = this.expandBuffer();
        op = this.op;
        olength = output.length;
      }

      while (codeLength--) {
        output[op] = output[op++ - codeDist];
      }

      // break
      if (this.ip === this.input.length) {
        this.op = op;
        return -1;
      }
    }

    while (this.bitsbuflen >= 8) {
      this.bitsbuflen -= 8;
      this.ip--;
    }

    this.op = op;
    this.status = Status.DECODE_BLOCK_END;
    return 0;
  }

  /**
   * expand output buffer. (dynamic)
   *
   * @param options option parameters.
   */
  expandBuffer(
    options: { fixRatio?: number; addRatio?: number } = {}
  ): Uint8Array {
    /** expantion ratio. */
    let ratio: number = (this.input.length / this.ip + 1) | 0;
    /**  maximum number of huffman code. */
    let maxHuffCode: number;
    /**  new output buffer size. */
    let newSize: number;
    /**  max inflate size. */
    let maxInflateSize: number;

    const input: Uint8Array = this.input;
    const output: Uint8Array = this.output;

    // First rewind the buffer but only if it will recover a considerable
    // amount of memory. Avoid moving large part of the buffer to a short
    // distance which will recover few memory and we will need another
    // expansion soon. In such case it's better to go to the reallocation
    // immediately.
    if (this.sp > 2 * RawInflateStream.MaxBackwardLength) {
      this.rewindOutputBuffer();
      return this.output;
    }

    if (options.fixRatio) {
      ratio = options.fixRatio;
    }
    if (options.addRatio) {
      ratio += options.addRatio;
    }

    // calculate new buffer size
    if (ratio < 2) {
      maxHuffCode = (input.length - this.ip) / this.litlenTable[2];
      maxInflateSize = ((maxHuffCode / 2) * 258) | 0;
      newSize =
        maxInflateSize < output.length
          ? output.length + maxInflateSize
          : output.length << 1;
    } else {
      newSize = output.length * ratio;
    }

    // Ignore all calculations above, maybe should be removed. Instead expand
    // the buffer twice if it is small or at 1 MB steps if it is large.
    if (output.length < 1048576) {
      newSize = 2 * output.length;
    } else {
      newSize = output.length + 1048576;
    }

    /** store buffer. */
    const buffer: Uint8Array = new Uint8Array(newSize);
    // buffer expantion
    buffer.set(output);
    this.output = buffer;

    return this.output;
  }

  /**
   * Rewind the output buffer: move the valuable contents to the beginning
   * of the buffer. This recovers some memory at the end of the buffer and
   * minimizes the need to expand. Also updates this.sp and this.op.
   */
  rewindOutputBuffer() {
    if (this.sp < RawInflateStream.MaxBackwardLength) return;

    if (this.output.copyWithin) {
      this.output.copyWithin(
        0,
        this.sp - RawInflateStream.MaxBackwardLength,
        this.op
      );
    } else {
      const tmp = new Uint8Array(
        this.output.subarray(
          this.sp - RawInflateStream.MaxBackwardLength,
          this.op
        )
      );
      this.output.set(tmp);
    }
    this.op -= this.sp - RawInflateStream.MaxBackwardLength;
    this.sp = RawInflateStream.MaxBackwardLength;
  }

  /**
   * concat output buffer. (dynamic)
   */
  concatBuffer(): Uint8Array {
    /**  output buffer. */
    let buffer: Uint8Array;
    const op: number = this.op;

    if (this.resize) {
      buffer = new Uint8Array(this.output.subarray(this.sp, op));
    } else {
      buffer = this.output.subarray(this.sp, op);
    }

    this.sp = op;

    return buffer;
  }
}
