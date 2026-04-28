export interface VideoQuality { label: string; url: string; size?: number; }
export interface Subtitle { language: string; url: string; format: string; }
export interface VideoMetadata { title: string; thumbnail?: string; qualities: VideoQuality[]; subtitles: Subtitle[]; source: 'animecube' | 'dailymotion'; }
export interface DownloadOptions { qualityLabel?: string; outputFile?: string; concurrency?: number; }
export interface DownloadProgress { percent: number; speed: number; eta: number; transferred: number; total: number; }
