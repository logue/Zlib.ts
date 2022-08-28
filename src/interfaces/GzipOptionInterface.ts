import type DeflateOptionInterface from './DeflateOptionInterface';

export default interface GzipOptionInterface {
  flags: {
    fname: string;
    fcomment: string;
    fhcrc: number;
  };
  filename: string;
  comment: string;
  deflateOptions: DeflateOptionInterface;
  noBuffer?: boolean;
}
