import BitStream from './BitStream';
import Heap from './Heap';
import type DeflateOptionInterface from './interfaces/DeflateOptionInterface';
import Lz77Match from './Lz77Match';
import {
  CompressionType,
  type CompressionTypeType,
} from './types/CompressionTypes';

/**
 * Deflate (RFC1951) 符号化アルゴリズム実装.
 */
export default class RawDeflate {
  /** comporession type */
  private compressionType: CompressionTypeType;
  private lazy: number;
  private freqsLitLen: Uint32Array;
  private freqsDist: Uint32Array;
  /** input buffer */
  private input: Uint8Array;
  /**  output buffer. */
  private output: Uint8Array;
  /**  pos output buffer position. */
  public op: number;

  /**
   * Raw Deflate 実装
   *
   * @param input - 符号化する対象のバッファ.
   * @param options - option parameters.
   */
  constructor(input: Uint8Array, options: DeflateOptionInterface) {
    this.compressionType = CompressionType.DYNAMIC;
    this.lazy = 0;
    this.input = new Uint8Array(input);
    this.output = new Uint8Array(0x8000);
    this.freqsLitLen = new Uint32Array();
    this.freqsDist = new Uint32Array();
    this.op = 0;

    // option parameters
    this.lazy = options.lazy || 0;
    this.compressionType = options.compressionType || CompressionType.NONE;
    this.output = new Uint8Array(options.outputBuffer || undefined);
    this.op = options.outputIndex || 0;
  }

  /**
   * LZ77 の最小マッチ長
   */
  static readonly Lz77MinLength: number = 3;

  /**
   * LZ77 の最大マッチ長
   */
  static readonly Lz77MaxLength: number = 258;

  /**
   * LZ77 のウィンドウサイズ
   */
  static readonly WindowSize: number = 0x8000;

  /**
   * 最長の符号長
   */
  static readonly MaxCodeLength: number = 16;

  /**
   * ハフマン符号の最大数値
   */
  static readonly HUFMAX: number = 286;

  /**
   * 固定ハフマン符号の符号化テーブル
   */
  static FixedHuffmanTable = (() => {
    const table = [];

    for (let i = 0; i < 288; i++) {
      switch (true) {
        case i <= 143:
          table.push([i + 0x030, 8]);
          break;
        case i <= 255:
          table.push([i - 144 + 0x190, 9]);
          break;
        case i <= 279:
          table.push([i - 256 + 0x000, 7]);
          break;
        case i <= 287:
          table.push([i - 280 + 0x0c0, 8]);
          break;
        default:
          throw new Error('invalid literal: ' + i);
      }
    }

    return table;
  })();

  /**
   * DEFLATE ブロックの作成
   */
  compress(): Uint8Array {
    let blockArray: Uint8Array;
    let position: number;
    let length: number;

    const input = this.input;

    // compression
    switch (this.compressionType) {
      case CompressionType.NONE:
        // each 65535-Byte (length header: 16-bit)
        for (position = 0, length = input.length; position < length; ) {
          blockArray = input.subarray(position, position + 0xffff);
          position += blockArray.length;
          this.makeNocompressBlock(blockArray, position === length);
        }
        break;
      case CompressionType.FIXED:
        this.output = this.makeFixedHuffmanBlock(input, true);
        this.op = this.output.length;
        break;
      case CompressionType.DYNAMIC:
        this.output = this.makeDynamicHuffmanBlock(input, true);
        this.op = this.output.length;
        break;
      default:
        throw new Error('invalid compression type');
    }

    return this.output;
  }

  /**
   * 非圧縮ブロックの作成
   *
   * @param blockArray - ブロックデータ byte array.
   * @param isFinalBlock - 最後のブロックならばtrue.
   */
  makeNocompressBlock(
    blockArray: Uint8Array,
    isFinalBlock: boolean
  ): Uint8Array {
    let op = this.op;

    // expand buffer
    let output = new Uint8Array(this.output.buffer);
    while (output.length <= op + blockArray.length + 5) {
      output = new Uint8Array(output.length << 1);
    }
    output.set(this.output);

    // header
    const bfinal: number = isFinalBlock ? 1 : 0;
    const btype = CompressionType.NONE;
    output[op++] = bfinal | (btype << 1);

    // length
    const len: number = blockArray.length;
    const nlen: number = (~len + 0x10000) & 0xffff;
    output[op++] = len & 0xff;
    output[op++] = (len >>> 8) & 0xff;
    output[op++] = nlen & 0xff;
    output[op++] = (nlen >>> 8) & 0xff;

    // copy buffer
    output.set(blockArray, op);
    op += blockArray.length;
    output = output.subarray(0, op);

    this.op = op;
    this.output = output;

    return output;
  }

  /**
   * 固定ハフマンブロックの作成
   *
   * @param blockArray - ブロックデータ byte array.
   * @param isFinalBlock - 最後のブロックならばtrue.
   */
  makeFixedHuffmanBlock(
    blockArray: Uint8Array,
    isFinalBlock: boolean
  ): Uint8Array {
    const stream = new BitStream(new Uint8Array(this.output.buffer), this.op);

    // header
    const bfinal: number = isFinalBlock ? 1 : 0;
    const btype = CompressionType.FIXED;

    stream.writeBits(bfinal, 1, true);
    stream.writeBits(btype, 2, true);

    const data: Uint16Array = this.lz77(blockArray);
    this.fixedHuffman(data, stream);

    return stream.finish();
  }

  /**
   * 動的ハフマンブロックの作成
   *
   * @param  blockArray - ブロックデータ byte array.
   * @param  isFinalBlock - 最後のブロックならばtrue.
   */
  makeDynamicHuffmanBlock(
    blockArray: Uint8Array,
    isFinalBlock: boolean
  ): Uint8Array {
    const stream = new BitStream(new Uint8Array(this.output.buffer), this.op);
    let hlit: number;
    let hdist: number;
    let hclen: number;
    const hclenOrder: number[] = [
      16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
    ];
    const transLengths = new Array(19);
    let code: number;
    let bitlen: number;
    let i: number;
    let il: number;

    // header
    const bfinal: number = isFinalBlock ? 1 : 0;
    const btype: CompressionTypeType = CompressionType.DYNAMIC;

    stream.writeBits(bfinal, 1, true);
    stream.writeBits(btype, 2, true);

    const data: Uint16Array = this.lz77(blockArray);

    // リテラル・長さ, 距離のハフマン符号と符号長の算出
    const litLenLengths = this.getLengths_(this.freqsLitLen, 15);
    const litLenCodes = this.getCodesFromLengths_(litLenLengths);
    const distLengths = this.getLengths_(this.freqsDist, 7);
    const distCodes = this.getCodesFromLengths_(distLengths);

    // HLIT, HDIST の決定
    for (hlit = 286; hlit > 257 && litLenLengths[hlit - 1] === 0; hlit--) {
      // empty
    }
    for (hdist = 30; hdist > 1 && distLengths[hdist - 1] === 0; hdist--) {
      // empty
    }

    // HCLEN
    const treeSymbols: { codes: Uint32Array; freqs: Uint32Array } =
      this.getTreeSymbols_(hlit, litLenLengths, hdist, distLengths);
    const treeLengths: Uint8Array = this.getLengths_(treeSymbols.freqs, 7);
    for (i = 0; i < 19; i++) {
      transLengths[i] = treeLengths[hclenOrder[i]];
    }
    for (hclen = 19; hclen > 4 && transLengths[hclen - 1] === 0; hclen--) {
      // empty
    }

    const treeCodes: Uint16Array = this.getCodesFromLengths_(treeLengths);

    // 出力
    stream.writeBits(hlit - 257, 5, true);
    stream.writeBits(hdist - 1, 5, true);
    stream.writeBits(hclen - 4, 4, true);
    for (i = 0; i < hclen; i++) {
      stream.writeBits(transLengths[i], 3, true);
    }

    // ツリーの出力
    for (i = 0, il = treeSymbols.codes.length; i < il; i++) {
      code = treeSymbols.codes[i];

      stream.writeBits(treeCodes[code], treeLengths[code], true);

      // extra bits
      if (code >= 16) {
        i++;
        switch (code) {
          case 16:
            bitlen = 2;
            break;
          case 17:
            bitlen = 3;
            break;
          case 18:
            bitlen = 7;
            break;
          default:
            throw new Error('invalid code: ' + code);
        }

        stream.writeBits(treeSymbols.codes[i], bitlen, true);
      }
    }

    this.dynamicHuffman(
      data,
      [litLenCodes, litLenLengths],
      [distCodes, distLengths],
      stream
    );

    return stream.finish();
  }

  /**
   * 動的ハフマン符号化(カスタムハフマンテーブル)
   *
   * @param  dataArray - LZ77 符号化済み byte array.
   * @param stream - 書き込み用ビットストリーム.
   */
  dynamicHuffman(
    dataArray: Uint16Array,
    litLen: any,
    dist: any,
    stream: BitStream
  ): BitStream {
    let index: number;
    let length: number;
    let literal: number;
    let code: number;

    const litLenCodes: number[] = litLen[0];
    const litLenLengths: number[] = litLen[1];
    const distCodes: number[] = dist[0];
    const distLengths: number[] = dist[1];

    // 符号を BitStream に書き込んでいく
    for (index = 0, length = dataArray.length; index < length; ++index) {
      literal = dataArray[index];

      // literal or length
      stream.writeBits(litLenCodes[literal], litLenLengths[literal], true);

      // 長さ・距離符号
      if (literal > 256) {
        // length extra
        stream.writeBits(dataArray[++index], dataArray[++index], true);
        // distance
        code = dataArray[++index];
        stream.writeBits(distCodes[code], distLengths[code], true);
        // distance extra
        stream.writeBits(dataArray[++index], dataArray[++index], true);
        // 終端
      } else if (literal === 256) {
        break;
      }
    }

    return stream;
  }

  /**
   * 固定ハフマン符号化
   *
   * @param dataArray - LZ77 符号化済み byte array.
   * @param  stream - 書き込み用ビットストリーム.
   */
  fixedHuffman(dataArray: Uint16Array, stream: BitStream): BitStream {
    let index: number;
    let length: number;
    let literal: number;

    for (index = 0, length = dataArray.length; index < length; index++) {
      // 符号を BitStream に書き込んでいく
      literal = dataArray[index];

      // 符号の書き込み
      BitStream.prototype.writeBits.apply(
        stream,
        RawDeflate.FixedHuffmanTable[literal]
      );

      // 長さ・距離符号
      if (literal > 0x100) {
        // length extra
        stream.writeBits(dataArray[++index], dataArray[++index], true);
        // distance
        stream.writeBits(dataArray[++index], 5, false);
        // distance extra
        stream.writeBits(dataArray[++index], dataArray[++index], true);
        // 終端
      } else if (literal === 0x100) {
        break;
      }
    }

    return stream;
  }

  /**
   * LZ77 実装
   *
   * @param dataArray - LZ77 符号化するバイト配列.
   */
  lz77(dataArray: Uint8Array): Uint16Array {
    /** input position */
    let position: number;
    /** input length */
    let length: number;
    /** loop counter */
    let i: number;
    /** loop limiter */
    let il: number;
    /**  chained-hash-table key */
    let matchKey: number;
    /** chained-hash-table */
    const table: Record<number, number[]> = {};
    const windowSize: number = RawDeflate.WindowSize;
    /** match list */
    let matchList: number[];
    /** longest match */
    let longestMatch: Lz77Match;
    /** previous longest match */
    let prevMatch: Lz77Match | undefined;
    /**  lz77 buffer */
    const lz77buf: Uint16Array = new Uint16Array(dataArray.length * 2);
    /** lz77 output buffer pointer */
    let pos: number = 0;
    /** lz77 skip length */
    let skipLength: number = 0;
    const freqsLitLen = new Uint32Array(286);
    const freqsDist = new Uint32Array(30);
    const lazy: number = this.lazy;
    /**  temporary variable */
    let tmp;

    // 初期化
    freqsLitLen[256] = 1; // EOB の最低出現回数は 1

    /**
     * マッチデータの書き込み
     *
     * @param  match - LZ77 Match data.
     * @param  offset - スキップ開始位置(相対指定).
     */
    function writeMatch(match: Lz77Match, offset: number) {
      const lz77Array: number[] = match.toLz77Array();
      let i: number;
      let il: number;

      for (i = 0, il = lz77Array.length; i < il; ++i) {
        lz77buf[pos++] = lz77Array[i];
      }
      freqsLitLen[lz77Array[0]]++;
      freqsDist[lz77Array[3]]++;
      skipLength = match.length + offset - 1;
      prevMatch = undefined;
    }

    // LZ77 符号化
    for (
      position = 0, length = dataArray.length;
      position < length;
      ++position
    ) {
      // ハッシュキーの作成
      for (matchKey = 0, i = 0, il = RawDeflate.Lz77MinLength; i < il; ++i) {
        if (position + i === length) {
          break;
        }
        matchKey = (matchKey << 8) | dataArray[position + i];
      }

      // テーブルが未定義だったら作成する
      if (table[matchKey] === void 0) {
        table[matchKey] = [];
      }
      matchList = table[matchKey];

      // skip
      if (skipLength-- > 0) {
        matchList.push(position);
        continue;
      }

      // マッチテーブルの更新 (最大戻り距離を超えているものを削除する)
      while (matchList.length > 0 && position - matchList[0] > windowSize) {
        matchList.shift();
      }

      // データ末尾でマッチしようがない場合はそのまま流しこむ
      if (position + RawDeflate.Lz77MinLength >= length) {
        if (prevMatch) {
          writeMatch(prevMatch, -1);
        }

        for (i = 0, il = length - position; i < il; ++i) {
          tmp = dataArray[position + i];
          lz77buf[pos++] = tmp;
          ++freqsLitLen[tmp];
        }
        break;
      }

      // マッチ候補から最長のものを探す
      if (matchList.length > 0) {
        longestMatch = this.searchLongestMatch_(dataArray, position, matchList);

        if (prevMatch) {
          // 現在のマッチの方が前回のマッチよりも長い
          if (prevMatch.length < longestMatch.length) {
            // write previous literal
            tmp = dataArray[position - 1];
            lz77buf[pos++] = tmp;
            ++freqsLitLen[tmp];

            // write current match
            writeMatch(longestMatch, 0);
          } else {
            // write previous match
            writeMatch(prevMatch, -1);
          }
        } else if (longestMatch.length < lazy) {
          prevMatch = longestMatch;
        } else {
          writeMatch(longestMatch, 0);
        }
        // 前回マッチしていて今回マッチがなかったら前回のを採用
      } else if (prevMatch) {
        writeMatch(prevMatch, -1);
      } else {
        tmp = dataArray[position];
        lz77buf[pos++] = tmp;
        ++freqsLitLen[tmp];
      }

      matchList.push(position); // マッチテーブルに現在の位置を保存
    }

    // 終端処理
    lz77buf[pos++] = 256;
    freqsLitLen[256]++;
    this.freqsLitLen = freqsLitLen;
    this.freqsDist = freqsDist;

    return lz77buf.subarray(0, pos);
  }

  /**
   * マッチした候補の中から最長一致を探す
   *
   * @param data - plain data byte array.
   * @param  position - plain data byte array position.
   * @param  matchList - 候補となる位置の配列.
   */
  searchLongestMatch_(
    data: Uint8Array,
    position: number,
    matchList: number[]
  ): Lz77Match {
    let match;
    let currentMatch = 0;
    let matchMax = 0;
    let matchLength;
    let i;
    let j;
    let l;
    const dl = data.length;

    // 候補を後ろから 1 つずつ絞り込んでゆく
    // @ts-ignore
    permatch: for (i = 0, l = matchList.length; i < l; i++) {
      match = matchList[l - i - 1];
      matchLength = RawDeflate.Lz77MinLength;

      // 前回までの最長一致を末尾から一致検索する
      if (matchMax > RawDeflate.Lz77MinLength) {
        for (j = matchMax; j > RawDeflate.Lz77MinLength; j--) {
          if (data[match + j - 1] !== data[position + j - 1]) {
            continue permatch;
          }
        }
        matchLength = matchMax;
      }

      // 最長一致探索
      while (
        matchLength < RawDeflate.Lz77MaxLength &&
        position + matchLength < dl &&
        data[match + matchLength] === data[position + matchLength]
      ) {
        ++matchLength;
      }

      // マッチ長が同じ場合は後方を優先
      if (matchLength > matchMax) {
        currentMatch = match;
        matchMax = matchLength;
      }

      // 最長が確定したら後の処理は省略
      if (matchLength === RawDeflate.Lz77MaxLength) {
        break;
      }
    }

    return new Lz77Match(matchMax, position - currentMatch);
  }

  /**
   * Tree-Transmit Symbols の算出
   * reference: PuTTY Deflate implementation
   *
   * @param hlit - HLIT.
   * @param litlenLengths - リテラルと長さ符号の符号長配列.
   * @param  hdist - HDIST.
   * @param distLengths - 距離符号の符号長配列.
   */
  getTreeSymbols_(
    hlit: number,
    litlenLengths: Uint8Array,
    hdist: number,
    distLengths: Uint8Array
  ): {
    codes: Uint32Array;
    freqs: Uint32Array;
  } {
    const src = new Uint32Array(hlit + hdist);
    let i;
    let j;
    let runLength;
    let l;
    const result = new Uint32Array(286 + 30);
    let nResult;
    let rpt;
    const freqs = new Uint32Array(19);

    j = 0;
    for (i = 0; i < hlit; i++) {
      src[j++] = litlenLengths[i];
    }
    for (i = 0; i < hdist; i++) {
      src[j++] = distLengths[i];
    }

    // 符号化
    nResult = 0;
    for (i = 0, l = src.length; i < l; i += j) {
      // Run Length Encoding
      for (j = 1; i + j < l && src[i + j] === src[i]; ++j) {
        // empty
      }

      runLength = j;

      if (src[i] === 0) {
        // 0 の繰り返しが 3 回未満ならばそのまま
        if (runLength < 3) {
          while (runLength-- > 0) {
            result[nResult++] = 0;
            freqs[0]++;
          }
        } else {
          while (runLength > 0) {
            // 繰り返しは最大 138 までなので切り詰める
            rpt = runLength < 138 ? runLength : 138;

            if (rpt > runLength - 3 && rpt < runLength) {
              rpt = runLength - 3;
            }

            // 3-10 回 -> 17
            if (rpt <= 10) {
              result[nResult++] = 17;
              result[nResult++] = rpt - 3;
              freqs[17]++;
              // 11-138 回 -> 18
            } else {
              result[nResult++] = 18;
              result[nResult++] = rpt - 11;
              freqs[18]++;
            }

            runLength -= rpt;
          }
        }
      } else {
        result[nResult++] = src[i];
        freqs[src[i]]++;
        runLength--;

        // 繰り返し回数が3回未満ならばランレングス符号は要らない
        if (runLength < 3) {
          while (runLength-- > 0) {
            result[nResult++] = src[i];
            freqs[src[i]]++;
          }
          // 3 回以上ならばランレングス符号化
        } else {
          while (runLength > 0) {
            // runLengthを 3-6 で分割
            rpt = runLength < 6 ? runLength : 6;

            if (rpt > runLength - 3 && rpt < runLength) {
              rpt = runLength - 3;
            }

            result[nResult++] = 16;
            result[nResult++] = rpt - 3;
            freqs[16]++;

            runLength -= rpt;
          }
        }
      }
    }

    return {
      codes: result.subarray(0, nResult),
      freqs: freqs,
    };
  }

  /**
   * ハフマン符号の長さを取得する
   *
   * @param freqs - 出現カウント.
   * @param  limit - 符号長の制限.
   */
  private getLengths_(freqs: Uint32Array, limit: number): Uint8Array {
    const nSymbols: number = freqs.length;
    const heap: Heap = new Heap(2 * RawDeflate.HUFMAX);
    const length = new Uint8Array(nSymbols);
    let i: number;
    let il: number;

    // ヒープの構築
    for (i = 0; i < nSymbols; ++i) {
      if (freqs[i] > 0) {
        heap.push(i, freqs[i]);
      }
    }
    const nodes: any[] = new Array(heap.length / 2);
    const values = new Uint32Array(heap.length / 2);

    // 非 0 の要素が一つだけだった場合は、そのシンボルに符号長 1 を割り当てて終了
    if (nodes.length === 1) {
      length[heap.pop().index] = 1;
      return length;
    }

    // Reverse Package Merge Algorithm による Canonical Huffman Code の符号長決定
    for (i = 0, il = heap.length / 2; i < il; ++i) {
      nodes[i] = heap.pop();
      values[i] = nodes[i].value;
    }
    const codeLength: Uint8Array = this.reversePackageMerge_(
      values,
      values.length,
      limit
    );

    for (i = 0, il = nodes.length; i < il; ++i) {
      length[nodes[i].index] = codeLength[i];
    }

    return length;
  }

  /**
   * Reverse Package Merge Algorithm.
   *
   * @param freqs - sorted probability.
   * @param symbols - number of symbols.
   * @param limit - code length limit.
   */
  reversePackageMerge_(
    freqs: Uint32Array,
    symbols: number,
    limit: number
  ): Uint8Array {
    const minimumCost: Uint16Array = new Uint16Array(limit);
    const flag: Uint8Array = new Uint8Array(limit);
    const codeLength: Uint8Array = new Uint8Array(symbols);
    const value: any[] = new Array(limit);
    const type: any[] = new Array(limit);
    const currentPosition: number[] = new Array(limit);
    let excess: number = (1 << limit) - symbols;
    const half: number = 1 << (limit - 1);
    let i: number;
    let j: number;
    let t;
    let weight: number;
    let next: number;

    /**
     * takePackage.
     *
     * @param k -
     */
    function takePackage(k: number) {
      const x: number = type[k][currentPosition[k]];

      if (x === symbols) {
        takePackage(k + 1);
        takePackage(k + 1);
      } else {
        --codeLength[x];
      }

      ++currentPosition[k];
    }

    minimumCost[limit - 1] = symbols;

    for (j = 0; j < limit; ++j) {
      if (excess < half) {
        flag[j] = 0;
      } else {
        flag[j] = 1;
        excess -= half;
      }
      excess <<= 1;
      minimumCost[limit - 2 - j] =
        ((minimumCost[limit - 1 - j] / 2) | 0) + symbols;
    }
    minimumCost[0] = flag[0];

    value[0] = new Array(minimumCost[0]);
    type[0] = new Array(minimumCost[0]);
    for (j = 1; j < limit; ++j) {
      if (minimumCost[j] > 2 * minimumCost[j - 1] + flag[j]) {
        minimumCost[j] = 2 * minimumCost[j - 1] + flag[j];
      }
      value[j] = new Array(minimumCost[j]);
      type[j] = new Array(minimumCost[j]);
    }

    for (i = 0; i < symbols; ++i) {
      codeLength[i] = limit;
    }

    for (t = 0; t < minimumCost[limit - 1]; ++t) {
      value[limit - 1][t] = freqs[t];
      type[limit - 1][t] = t;
    }

    for (i = 0; i < limit; ++i) {
      currentPosition[i] = 0;
    }
    if (flag[limit - 1] === 1) {
      --codeLength[0];
      ++currentPosition[limit - 1];
    }

    for (j = limit - 2; j >= 0; --j) {
      i = 0;
      weight = 0;
      next = currentPosition[j + 1];

      for (t = 0; t < minimumCost[j]; t++) {
        weight = value[j + 1][next] + value[j + 1][next + 1];

        if (weight > freqs[i]) {
          value[j][t] = weight;
          type[j][t] = symbols;
          next += 2;
        } else {
          value[j][t] = freqs[i];
          type[j][t] = i;
          ++i;
        }
      }

      currentPosition[j] = 0;
      if (flag[j] === 1) {
        takePackage(j);
      }
    }

    return codeLength;
  }

  /**
   * 符号長配列からハフマン符号を取得する
   * reference: PuTTY Deflate implementation
   *
   * @param lengths - 符号長配列.
   */
  private getCodesFromLengths_(lengths: Uint8Array): Uint16Array {
    const codes = new Uint16Array(lengths.length);
    const count: number[] = [];
    const startCode: number[] = [];
    let code = 0;
    let i;
    let il;
    let j;
    let m;

    // Count the codes of each length.
    for (i = 0, il = lengths.length; i < il; i++) {
      count[lengths[i]] = (count[lengths[i]] | 0) + 1;
    }

    // Determine the starting code for each length block.
    for (i = 1, il = RawDeflate.MaxCodeLength; i <= il; i++) {
      startCode[i] = code;
      code += count[i] | 0;
      code <<= 1;
    }

    // Determine the code for each symbol. Mirrored, of course.
    for (i = 0, il = lengths.length; i < il; i++) {
      code = startCode[lengths[i]];
      startCode[lengths[i]] += 1;
      codes[i] = 0;

      for (j = 0, m = lengths[i]; j < m; j++) {
        codes[i] = (codes[i] << 1) | (code & 1);
        code >>>= 1;
      }
    }

    return codes;
  }
}
