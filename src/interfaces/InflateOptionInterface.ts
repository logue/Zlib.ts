import type { BufferTypeType } from '../types/BufferType';

export default interface InflateOptionInterface {
  /** input buffer の deflate コンテナの開始位置.*/
  index?: number;
  /** バッファのブロックサイズ. */
  bufferSize?: number;
  /** BufferType の値によってバッファの管理方法を指定する */
  bufferType?: BufferTypeType;
  /** 確保したバッファが実際の大きさより大きかった場合に切り詰める. */
  resize?: boolean;
  verify?: boolean;
  noBuffer?: boolean;
}
