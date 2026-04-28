import { VideoMetadata } from '../types';
export abstract class Extractor {
  abstract validate(url: string): boolean;
  abstract extract(url: string): Promise<VideoMetadata>;
}
