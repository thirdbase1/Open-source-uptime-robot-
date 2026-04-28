import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import { DownloadOptions, DownloadProgress } from '../types';

export class Downloader extends EventEmitter {
  constructor() {
    super();
  }

  async download(url: string, outputFile: string, options: DownloadOptions = {}): Promise<void> {
    if (url.includes('.m3u8')) {
      await this.downloadHLSConcurrent(url, outputFile, options.concurrency || 10);
    } else {
      await this.downloadFile(url, outputFile);
    }
  }

  private async downloadFile(url: string, outputFile: string): Promise<void> {
    const res = await axios({ method: 'GET', url, responseType: 'stream' });
    const totalLength = parseInt(res.headers['content-length']?.toString() || '0', 10);
    let downloaded = 0;
    const writer = fs.createWriteStream(outputFile);

    res.data.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      this.emit('progress', {
        percent: totalLength ? (downloaded / totalLength) * 100 : 0,
        transferred: downloaded,
        total: totalLength
      });
    });

    res.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve());
      writer.on('error', reject);
    });
  }

  async downloadHLSConcurrent(url: string, outputFile: string, concurrency: number): Promise<void> {
    const limit = pLimit(concurrency);
    const response = await axios.get(url);
    const playlist = response.data;

    const lines = playlist.split('\n');
    const segments: string[] = [];
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

    for (const line of lines) {
        if (line && !line.startsWith('#')) {
            segments.push(line.startsWith('http') ? line : new URL(line, baseUrl).href);
        }
    }

    if (segments.length === 0) throw new Error('No segments found in m3u8');

    const tempDir = path.join(path.dirname(outputFile), 'temp_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        let downloadedSegments = 0;
        await Promise.all(segments.map((segUrl, index) => limit(async () => {
            const segmentPath = path.join(tempDir, `${index.toString().padStart(5, '0')}.ts`);
            const res = await axios({ method: 'GET', url: segUrl, responseType: 'stream' });
            const writer = fs.createWriteStream(segmentPath);
            res.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(undefined));
                writer.on('error', reject);
            });
            downloadedSegments++;
            this.emit('progress', {
                percent: (downloadedSegments / segments.length) * 100,
                transferred: downloadedSegments,
                total: segments.length
            });
        })));

        const finalWriter = fs.createWriteStream(outputFile);
        const segmentFiles = fs.readdirSync(tempDir).sort();

        for (const file of segmentFiles) {
            const segmentPath = path.join(tempDir, file);
            const reader = fs.createReadStream(segmentPath);
            await new Promise((resolve, reject) => {
                reader.pipe(finalWriter, { end: false });
                reader.on('end', () => resolve(undefined));
                reader.on('error', reject);
            });
        }
        finalWriter.end();
        await new Promise((resolve) => finalWriter.on('finish', () => resolve(undefined)));

    } finally {
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          for (const file of files) {
              fs.unlinkSync(path.join(tempDir, file));
          }
          fs.rmdirSync(tempDir);
        }
    }
  }
}
