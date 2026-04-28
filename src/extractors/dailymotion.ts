import axios from 'axios';
import { Extractor } from './base';
import { VideoMetadata, VideoQuality, Subtitle } from '../types';

export class DailymotionExtractor extends Extractor {
  validate(url: string): boolean { return url.includes('dailymotion.com') || url.includes('dai.ly'); }
  async extract(url: string): Promise<VideoMetadata> {
    const videoId = url.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/)?.[1];
    if (!videoId) throw new Error('Invalid Dailymotion URL');

    const response = await axios.get(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
    const data = response.data;

    const qualities: VideoQuality[] = [];
    const masterUrl = data.qualities?.auto?.[0]?.url;

    if (masterUrl) {
        qualities.push({ label: 'Auto', url: masterUrl });
        try {
            const masterPlaylist = (await axios.get(masterUrl)).data;
            const lines = masterPlaylist.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                    const resMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/);
                    const nameMatch = lines[i].match(/NAME="([^"]+)"/);
                    const label = nameMatch ? nameMatch[1] : (resMatch ? resMatch[1].split('x')[1] + 'p' : 'unknown');
                    const nextLine = lines[i+1];
                    if (nextLine && !nextLine.startsWith('#')) {
                        qualities.push({ label, url: nextLine.trim() });
                    }
                }
            }
        } catch (e) {}
    }

    const subtitles: Subtitle[] = [];
    if (data.subtitles && data.subtitles.data) {
        Object.keys(data.subtitles.data).forEach(lang => {
            const sub = data.subtitles.data[lang];
            if (sub.urls && sub.urls.length > 0) {
                subtitles.push({ language: lang, url: sub.urls[0], format: 'vtt' });
            }
        });
    }

    return {
      title: data.title || 'Dailymotion Video',
      thumbnail: data.posters?.['720'],
      qualities: qualities.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i),
      subtitles,
      source: 'dailymotion'
    };
  }
}
