import Huffman from './Huffman';
import type InflateOptionInterface from './interfaces/InflateOptionInterface';
import { BufferType, type BufferTypeType } from './types/BufferType';

/** buffer block size. */
const ZLIB_RAW_INFLATE_BUFFER_SIZE: number = 0x8000; // [ 0x8000 >= ZLIB_BUFFER_BLOCK_SIZE ]

/** Raw Inflate class */
export default class RawInflate {
  /**  inflated buffer */
  private buffer: Uint8Array;
  /** Blocks */
  private blocks: Uint8Array[];
  /** block size. */
  private bufferSize: number;
  /** total output buffer pointer. */
  private totalpos: number;
  /**  input buffer pointer. */
  public ip: number;
  /**  bit stream reader buffer. */
  private bitsbuf: number;
  /** bit stream reader buffer size. */
  private bitsbuflen: number;
  /**  input buffer. */
  private input: Uint8Array;
  /**  output buffer. */
  public output: Uint8Array;
  /**  output buffer pointer. */
  private op: number;
  /**  is final block flag. */
  private bfinal: boolean;
  /**  buffer management. */
  private bufferType: BufferTypeType;
  /** resize flag for memory size optimization. */
  private resize: boolean;
  /**  previous RLE value */
  private prev: number;

  private currentLitlenTable: [Uint32Array, number, number];
  /**
   * @param input - input buffer.
   * @param option - option parameter.
   *
   * opt_params は以下のプロパティを指定する事ができます。
   *   - index: input buffer の deflate コンテナの開始位置.
   *   - blockSize: バッファのブロックサイズ.
   *   - bufferType: Zlib.RawInflate.BufferType の値によってバッファの管理方法を指定する.
   *   - resize: 確保したバッファが実際の大きさより大きかった場合に切り詰める.
   */
  constructor(input: Uint8Array, option: InflateOptionInterface = {}) {
    this.buffer = new Uint8Array();
    this.blocks = [];
    this.bufferSize = ZLIB_RAW_INFLATE_BUFFER_SIZE;
    this.totalpos = 0;
    this.ip = option.index || 0;
    this.bitsbuf = 0;
    this.bitsbuflen = 0;
    this.input = new Uint8Array(input);
    this.op = 0;
    this.bfinal = false;
    this.bufferSize = option.bufferSize || 0;
    this.bufferType = option.bufferType || BufferType.ADAPTIVE;
    this.resize = option.resize || false;
    this.prev = 0;
    this.currentLitlenTable = [new Uint32Array(), 0, 0];

    // initialize
    switch (this.bufferType) {
      case BufferType.BLOCK:
        this.op = RawInflate.MaxBackwardLength;
        this.output = new Uint8Array(
          RawInflate.MaxBackwardLength +
            this.bufferSize +
            RawInflate.MaxCopyLength
        );
        break;
      case BufferType.ADAPTIVE:
        this.op = 0;
        this.output = new Uint8Array(this.bufferSize);
        this.expandBuffer = this.expandBufferAdaptive;
        this.concatBuffer = this.concatBufferDynamic;
        this.decodeHuffman = this.decodeHuffmanAdaptive;
        break;
      default:
        throw new Error('invalid inflate mode');
    }
  }

  /**
   * decompress.
   */
  decompress(): Uint8Array {
    while (!this.bfinal) {
      this.parseBlock();
    }

    return this.concatBuffer();
  }

  /**
   *  max backward length for LZ77.
   */
  static readonly MaxBackwardLength: number = 32768;

  /**
   *  max copy length for LZ77.
   */
  static readonly MaxCopyLength: number = 258;

  /**
   * huffman order
   */
  static readonly Order: Uint16Array = (table => {
    return new Uint16Array(table);
  })([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);

  /**
   * huffman length code table.
   */
  static readonly LengthCodeTable: Uint16Array = ((table: number[]) => {
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
  static readonly LengthExtraTable: Uint8Array = (table => {
    return new Uint8Array(table);
  })([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5,
    5, 5, 5, 0, 0, 0,
  ]);

  /**
   * huffman dist code table.
   */
  static readonly DistCodeTable: Uint16Array = (table => {
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
  static readonly DistExtraTable: Uint8Array = (table => {
    return new Uint8Array(table);
  })([
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
    11, 11, 12, 12, 13, 13,
  ]);

  /**
   * fixed huffman length code table
   */
  static readonly FixedLiteralLengthTable: [Uint32Array, number, number] =
    (table => {
      return table;
    })(
      (() => {
        const lengths = new Uint8Array(288);
        const il = lengths.length;

        for (let i = 0; i < il; ++i) {
          lengths[i] = i <= 143 ? 8 : i <= 255 ? 9 : i <= 279 ? 7 : 8;
        }

        return Huffman.buildHuffmanTable(lengths);
      })()
    );

  /**
   * fixed huffman distance code table
   */
  static readonly FixedDistanceTable: [Uint32Array, number, number] =
    (table => {
      return table;
    })(
      (() => {
        const lengths = new Uint8Array(30);
        const il = lengths.length;

        for (let i = 0; i < il; ++i) {
          lengths[i] = 5;
        }

        return Huffman.buildHuffmanTable(lengths);
      })()
    );

  /**
   * parse deflated block.
   */
  parseBlock() {
    /**  header */
    let hdr: number = this.readBits(3);

    // BFINAL
    if (hdr & 0x1) {
      this.bfinal = true;
    }

    // BTYPE
    hdr >>>= 1;
    switch (hdr) {
      // uncompressed
      case 0:
        this.parseUncompressedBlock();
        break;
      // fixed huffman
      case 1:
        this.parseFixedHuffmanBlock();
        break;
      // dynamic huffman
      case 2:
        this.parseDynamicHuffmanBlock();
        break;
      // reserved or other
      default:
        throw new Error('unknown BTYPE: ' + hdr);
    }
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

    const inputLength: number = input.length;

    // not enough buffer
    while (bitsbuflen < length) {
      // input byte
      if (ip >= inputLength) {
        throw new Error('input buffer is broken');
      }

      // concat octet
      bitsbuf |= input[ip++] << bitsbuflen;
      bitsbuflen += 8;
    }

    /** output byte */
    const octet: number = bitsbuf & /* MASK */ ((1 << length) - 1);
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
   * @param table - huffman code table.
   */
  readCodeByTable(table: [Uint32Array, number, number]): number {
    let bitsbuf = this.bitsbuf;
    let bitsbuflen = this.bitsbuflen;
    const input = this.input;
    let ip = this.ip;

    const inputLength: number = input.length;
    /** huffman code table */
    const codeTable: Uint32Array = table[0];
    const maxCodeLength: number = table[1];

    // not enough buffer
    while (bitsbuflen < maxCodeLength) {
      if (ip >= inputLength) {
        break;
      }
      bitsbuf |= input[ip++] << bitsbuflen;
      bitsbuflen += 8;
    }

    // read max length
    /** code length & code (16bit, 16bit) */
    const codeWithLength: number =
      codeTable[bitsbuf & ((1 << maxCodeLength) - 1)];
    /**  code bits length */
    const codeLength: number = codeWithLength >>> 16;

    this.bitsbuf = bitsbuf >> codeLength;
    this.bitsbuflen = bitsbuflen - codeLength;
    this.ip = ip;

    return codeWithLength & 0xffff;
  }

  /**
   * parse uncompressed block.
   */
  parseUncompressedBlock() {
    const input = this.input;
    let ip = this.ip;
    let output = this.output;
    let op = this.op;

    const inputLength: number = input.length;
    /**  block length */
    let len: number;
    /** output buffer length */
    const olength: number = output.length;
    /**  copy counter */
    let preCopy: number;

    // skip buffered header bits
    this.bitsbuf = 0;
    this.bitsbuflen = 0;

    // len
    if (ip + 1 >= inputLength) {
      throw new Error('invalid uncompressed block header: LEN');
    }
    len = input[ip++] | (input[ip++] << 8);

    // nlen
    if (ip + 1 >= inputLength) {
      throw new Error('invalid uncompressed block header: NLEN');
    }
    /** number for check block length */
    const nlen: number = input[ip++] | (input[ip++] << 8);

    // check len & nlen
    if (len === ~nlen) {
      throw new Error('invalid uncompressed block header: length verify');
    }

    // check size
    if (ip + len > input.length) {
      throw new Error('input buffer is broken');
    }

    // expand buffer
    switch (this.bufferType) {
      case BufferType.BLOCK:
        // pre copy
        while (op + len > output.length) {
          preCopy = olength - op;
          len -= preCopy;
          output.set(input.subarray(ip, ip + preCopy), op);
          op += preCopy;
          ip += preCopy;

          this.op = op;
          output = this.expandBuffer();
          op = this.op;
        }
        break;
      case BufferType.ADAPTIVE:
        while (op + len > output.length) {
          output = this.expandBuffer(/* { fixRatio: 2 } */);
        }
        break;
      default:
        throw new Error('invalid inflate mode');
    }

    // copy

    output.set(input.subarray(ip, ip + len), op);
    op += len;
    ip += len;

    this.ip = ip;
    this.op = op;
    this.output = output;
  }

  /**
   * parse fixed huffman block.
   */
  parseFixedHuffmanBlock() {
    this.decodeHuffman(
      RawInflate.FixedLiteralLengthTable,
      RawInflate.FixedDistanceTable
    );
  }

  /**
   * parse dynamic huffman block.
   */
  parseDynamicHuffmanBlock() {
    /** number of literal and length codes. */
    const hlit: number = this.readBits(5) + 257;
    /** number of distance codes. */
    const hdist: number = this.readBits(5) + 1;
    /** number of code lengths. */
    const hclen: number = this.readBits(4) + 4;
    /** code lengths. */
    const codeLengths = new Uint8Array(RawInflate.Order.length);

    /**  loop counter. */
    let i: number;

    // decode code lengths
    for (i = 0; i < hclen; ++i) {
      codeLengths[RawInflate.Order[i]] = this.readBits(3);
    }
    /** code lengths table. */
    const codeLengthsTable: [Uint32Array, number, number] =
      Huffman.buildHuffmanTable(codeLengths);

    /**
     * decode function
     *
     * @param num - number of lengths.
     * @param  table - code lengths table.
     * @param  lengths - code lengths buffer.
     */
    const decode = (
      num: number,
      table: [Uint32Array, number, number],
      lengths: Uint8Array
    ): Uint8Array => {
      let code: number;
      let prev: number = this.prev;
      let repeat: number;

      for (let j: number = 0; j < num; ) {
        code = this.readCodeByTable(table);
        switch (code) {
          case 16:
            repeat = 3 + this.readBits(2);
            while (repeat--) {
              lengths[j++] = prev;
            }
            break;
          case 17:
            repeat = 3 + this.readBits(3);
            while (repeat--) {
              lengths[j++] = 0;
            }
            prev = 0;
            break;
          case 18:
            repeat = 11 + this.readBits(7);
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

    /** literal and length code lengths. */
    const litlenLengths: Uint8Array = new Uint8Array(hlit);
    /** distance code lengths. */
    const distLengths: Uint8Array = new Uint8Array(hdist);

    this.prev = 0;
    this.decodeHuffman(
      Huffman.buildHuffmanTable(
        decode.call(this, hlit, codeLengthsTable, litlenLengths)
      ),
      Huffman.buildHuffmanTable(
        decode.call(this, hdist, codeLengthsTable, distLengths)
      )
    );
  }

  /**
   * decode huffman code
   *
   * @param  litlen - literal and length code table.
   * @param  dist -  distination code table.
   */
  decodeHuffman(
    litlen: [Uint32Array, number, number],
    dist: [Uint32Array, number, number]
  ) {
    let output = this.output;
    let op = this.op;

    this.currentLitlenTable = litlen;

    /**  output position limit. */
    const olength: number = output.length - RawInflate.MaxCopyLength;
    /**  huffman code. */
    let code: number;
    /** table index. */
    let ti: number;
    /** huffman code distination. */
    let codeDist: number;
    /**  huffman code length. */
    let codeLength: number;

    while ((code = this.readCodeByTable(litlen)) !== 256) {
      // literal
      if (code < 256) {
        if (op >= olength) {
          this.op = op;
          output = this.expandBuffer();
          op = this.op;
        }
        output[op++] = code;

        continue;
      }

      // length code
      ti = code - 257;
      codeLength = RawInflate.LengthCodeTable[ti];
      if (RawInflate.LengthExtraTable[ti] > 0) {
        codeLength += this.readBits(RawInflate.LengthExtraTable[ti]);
      }

      // dist code
      code = this.readCodeByTable(dist);
      codeDist = RawInflate.DistCodeTable[code];
      if (RawInflate.DistExtraTable[code] > 0) {
        codeDist += this.readBits(RawInflate.DistExtraTable[code]);
      }

      // lz77 decode
      if (op >= olength) {
        this.op = op;
        output = this.expandBuffer();
        op = this.op;
      }
      while (codeLength--) {
        output[op] = output[op++ - codeDist];
      }
    }

    while (this.bitsbuflen >= 8) {
      this.bitsbuflen -= 8;
      this.ip--;
    }
    this.op = op;
  }

  /**
   * decode huffman code (adaptive)
   *
   * @param  litlen - literal and length code table.
   * @param  dist  - distination code table.
   */
  decodeHuffmanAdaptive(
    litlen: [Uint32Array, number, number],
    dist: [Uint32Array, number, number]
  ) {
    let output = this.output;
    let op = this.op;

    this.currentLitlenTable = litlen;

    /**  output position limit. */
    let olength: number = output.length;
    /**  huffman code. */
    let code: number;
    /** table index. */
    let ti: number;
    /** huffman code distination. */
    let codeDist;
    /** huffman code length. */
    let codeLength: number;

    while ((code = this.readCodeByTable(litlen)) !== 256) {
      // literal
      if (code < 256) {
        if (op >= olength) {
          output = this.expandBuffer();
          olength = output.length;
        }
        output[op++] = code;

        continue;
      }

      // length code
      ti = code - 257;
      codeLength = RawInflate.LengthCodeTable[ti];
      if (RawInflate.LengthExtraTable[ti] > 0) {
        codeLength += this.readBits(RawInflate.LengthExtraTable[ti]);
      }

      // dist code
      code = this.readCodeByTable(dist);
      codeDist = RawInflate.DistCodeTable[code];
      if (RawInflate.DistExtraTable[code] > 0) {
        codeDist += this.readBits(RawInflate.DistExtraTable[code]);
      }

      // lz77 decode
      if (op + codeLength > olength) {
        output = this.expandBuffer();
        olength = output.length;
      }
      while (codeLength--) {
        output[op] = output[op++ - codeDist];
      }
    }

    while (this.bitsbuflen >= 8) {
      this.bitsbuflen -= 8;
      this.ip--;
    }
    this.op = op;
  }

  /**
   * expand output buffer.
   */
  expandBuffer(): Uint8Array {
    /**  store buffer. */
    const buffer: Uint8Array = new Uint8Array(
      this.op - RawInflate.MaxBackwardLength
    );
    /**  backward base point */
    const backward: number = this.op - RawInflate.MaxBackwardLength;

    const output: Uint8Array = this.output;

    // copy to output buffer

    buffer.set(output.subarray(RawInflate.MaxBackwardLength, buffer.length));

    this.blocks.push(buffer);
    this.totalpos += buffer.length;

    // copy to backward buffer

    output.set(
      output.subarray(backward, backward + RawInflate.MaxBackwardLength)
    );

    this.op = RawInflate.MaxBackwardLength;

    return output;
  }

  /**
   * expand output buffer. (adaptive)
   *
   * @param params - option parameters.
   */
  expandBufferAdaptive(params = { fixRatio: 0, addRatio: 0 }): Uint8Array {
    /**  expantion ratio. */
    let ratio: number =
      params.fixRatio !== 0
        ? params.fixRatio
        : (this.input.length / this.ip + 1) | 0;
    /**  maximum number of huffman code. */
    let maxHuffCode: number;
    /**  new output buffer size. */
    let newSize: number;
    /** max inflate size. */
    let maxInflateSize: number;

    const input = this.input;
    const output = this.output;

    ratio += params.addRatio;

    // calculate new buffer size
    if (ratio < 2) {
      maxHuffCode = (input.length - this.ip) / this.currentLitlenTable[2];
      maxInflateSize = ((maxHuffCode / 2) * 258) | 0;
      newSize =
        maxInflateSize < output.length
          ? output.length + maxInflateSize
          : output.length << 1;
    } else {
      newSize = output.length * ratio;
    }

    /**  store buffer. */
    const buffer: Uint8Array = new Uint8Array(newSize);
    buffer.set(output);

    this.output = buffer;

    return this.output;
  }

  /**
   * concat output buffer.
   */
  concatBuffer(): Uint8Array {
    /** buffer pointer. */
    let pos: number = 0;
    /** buffer pointer. */
    const limit: number =
      this.totalpos + (this.op - RawInflate.MaxBackwardLength);
    /** output block array. */
    const output: Uint8Array = this.output;
    /**  blocks array. */
    const blocks: Uint8Array[] = this.blocks;
    /** output block array. */
    let block: Uint8Array;
    /**  output buffer. */
    const buffer = new Uint8Array(limit);
    /**  loop counter. */
    let i: number;
    /**  loop limiter. */
    let il: number;
    /** loop counter. */
    let j: number;
    /**  loop limiter. */
    let jl: number;

    // single buffer
    if (blocks.length === 0) {
      return this.output.subarray(RawInflate.MaxBackwardLength, this.op);
    }

    // copy to buffer
    for (i = 0, il = blocks.length; i < il; ++i) {
      block = blocks[i];
      for (j = 0, jl = block.length; j < jl; ++j) {
        buffer[pos++] = block[j];
      }
    }

    // current buffer
    for (i = RawInflate.MaxBackwardLength, il = this.op; i < il; ++i) {
      buffer[pos++] = output[i];
    }

    this.blocks = [];
    this.buffer = buffer;

    return this.buffer;
  }

  /**
   * concat output buffer. (dynamic)
   */
  concatBufferDynamic(): Uint8Array {
    /** output buffer. */
    let buffer: Uint8Array;
    const op = this.op;

    if (this.resize) {
      buffer = new Uint8Array(op);
      buffer.set(this.output.subarray(0, op));
    } else {
      buffer = this.output.subarray(0, op);
    }

    this.buffer = buffer;

    return this.buffer;
  }
}
