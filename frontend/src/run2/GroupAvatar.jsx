import React, { useEffect, useRef, useState } from 'react';
import { PackPresenter } from './avatar/packPresenter.mjs';
export function GroupAvatar({ packId: inputId, roomId }) {
    const [resolved, setResolved] = useState('stickman');
    const packId = inputId || resolved;
    useEffect(() => { if (!roomId || inputId)
        return; const abort = new AbortController(); fetch('/api/v2/groups/classrooms/' + encodeURIComponent(roomId), { signal: abort.signal, credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(v => v && setResolved(v.avatar_pack_id || 'stickman')).catch(() => undefined); return () => abort.abort(); }, [roomId, inputId]);
    const host = useRef(null);
    const [ready, setReady] = useState(false), [note, setNote] = useState('基本角色');
    useEffect(() => {
        let alive = true;
        let presenter;
        const abort = new AbortController();
        setReady(false);
        if (packId === 'stickman') {
            setNote('基本角色');
            return () => abort.abort();
        }
        fetch('/avatar-packs/catalog.json', { signal: abort.signal }).then(r => { if (!r.ok)
            throw Error('CATALOG_READY_REQUIRED'); return r.json(); }).then(async (catalog) => {
            if (!alive)
                return;
            const pack = catalog.packs.find((p) => p.id === packId);
            if (!pack || !host.current)
                throw Error('SELECTED_PACK_READY_REQUIRED');
            presenter = new PackPresenter(host.current);
            await presenter.load(pack);
            if (alive) {
                setReady(true);
                setNote(pack.name + ' · ' + pack.talk_mode);
            }
        }).catch(() => { if (alive)
            setNote('基本角色 · 對話流程持續可用'); });
        return () => { alive = false; abort.abort(); void presenter?.dispose(); };
    }, [packId]);
    return <div style={{ position: 'relative', height: 360 }}><div ref={host} style={{ height: '100%', width: '100%' }}/>{!ready && <svg viewBox="0 0 200 240" aria-label="基本教室角色" role="img" style={{ position: 'absolute', inset: 20, height: 280, width: '100%' }}><circle cx="100" cy="55" r="25" fill="none" stroke="currentColor" strokeWidth="6"/><path d="M100 80V155 M50 117L100 98L150 117 M100 155L65 210 M100 155L135 210" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/></svg>}<small style={{ position: 'absolute', bottom: 4, left: 12 }}>{note}</small></div>;
}
