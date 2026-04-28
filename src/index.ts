import { DailymotionExtractor } from './extractors/dailymotion';
import { Downloader } from './downloader/engine';
import { VideoMetadata, DownloadOptions } from './types';

export class VideoSDK {
  private extractors = [new DailymotionExtractor()];
  private downloader = new Downloader();

  async getInfo(url: string): Promise<VideoMetadata> {
    const extractor = this.extractors.find(e => e.validate(url));
    if (!extractor) throw new Error('Unsupported URL. Only Dailymotion is supported currently.');
    return await extractor.extract(url);
  }

  async download(url: string, outputFile: string, options: DownloadOptions = {}): Promise<void> {
    const info = await this.getInfo(url);
    const downloadUrl = (options.qualityLabel ? info.qualities.find(q => q.label === options.qualityLabel)?.url : info.qualities[0]?.url);
    if (!downloadUrl) throw new Error('No download URL found for the given quality');
    return await this.downloader.download(downloadUrl, outputFile, options);
  }

  getDownloader() { return this.downloader; }
}

export * from './types';
