declare module '@met4citizen/talkinghead' {
  export class TalkingHead {
    constructor(element: HTMLElement, options: Record<string, unknown>)
    showAvatar(avatar: { url: string; body: string; avatarMood: string }): Promise<void>
    setView(view: string): void
    start(): void
    stop(): void
    renderer: { dispose(): void }
  }
}
