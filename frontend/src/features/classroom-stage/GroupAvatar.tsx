import { useEffect, useState } from 'react';
import { api } from '../../api/classroomClient';
import { TutorAvatar } from '../avatar/TutorAvatar';
/** 分組舞台的導師人像：給 packId 就直接用；只給 roomId 時向後端查。'stickman' 視為未指定，用預設模型。 */
export function GroupAvatar({ packId: inputId, roomId, say }: { packId?: string; roomId?: string; say?: { id: string; text: string } | null }) {
    const [resolved, setResolved] = useState<string | null>(null);
    useEffect(() => {
        if (!roomId || inputId)
            return;
        let live = true;
        api('/groups/classrooms/' + encodeURIComponent(roomId)).then(v => { if (live && v) setResolved(v.avatar_pack_id || null); }).catch(() => undefined);
        return () => { live = false; };
    }, [roomId, inputId]);
    const chosen = inputId || resolved;
    return <div className="group-avatar" style={{ position: 'relative', height: 360 }}>
      <TutorAvatar product="socratic" packId={chosen && chosen !== 'stickman' ? chosen : null} say={say}/>
    </div>;
}
