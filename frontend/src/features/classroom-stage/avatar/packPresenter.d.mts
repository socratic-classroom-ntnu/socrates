export class PackPresenter {
  constructor(container: HTMLElement);
  ready: boolean;
  pack: any;
  load(pack: any): Promise<void>;
  play(buffer: AudioBuffer, events: any[]): Promise<{ state: string }>;
  playClip(name: string): void;
  setMood(mood: string): void;
  speakTimeline(events: { viseme: string; timeMs: number }[], durationMs: number, startAt?: number): void;
  alignSpeech(atMs: number): void;
  stopSpeech(): void;
  stop(): void;
  dispose(): Promise<void>;
}
