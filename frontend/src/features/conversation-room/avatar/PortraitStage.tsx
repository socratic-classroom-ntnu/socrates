import { TutorAvatar, type AvatarState } from '../../avatar/TutorAvatar';
/** Round 1 對話室的導師人像：與分組課堂、CE 共用 TutorAvatar（上半身、脖子以上動、嘴型跟語音）。 */
export function PortraitStage({ state, say }: { state: string; say?: { id: string; text: string } | null }) {
    const known: AvatarState[] = ['idle', 'listening', 'thinking', 'speaking'];
    return <div className="ce-portrait">
      <div className="ce-portrait-halo" aria-hidden="true"/>
      <TutorAvatar product="socratic" state={known.includes(state as AvatarState) ? state as AvatarState : 'idle'} say={say}/>
    </div>;
}
