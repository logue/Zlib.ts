import type { CompressionMethodType } from '../types/CompressionMethod';
import type DeflateOptionInterface from './DeflateOptionInterface';

export default interface ZipOptionInterface {
  filename: Uint8Array;
  extraField: Uint8Array;
  compressionMethod: CompressionMethodType;
  compress?: boolean;
  comment: Uint8Array;
  deflateOption: DeflateOptionInterface;
  password?: Uint8Array;
  verify?: boolean;
}
