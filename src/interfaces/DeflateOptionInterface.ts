import type { CompressionTypeType } from '../types/CompressionTypes';

export default interface DeflateOptionInterface {
  lazy?: number;
  compressionType?: CompressionTypeType;
  outputBuffer: Uint8Array;
  outputIndex: number;
  noBuffer?: boolean;
}
