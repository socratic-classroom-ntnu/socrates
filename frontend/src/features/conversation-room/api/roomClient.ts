import { getLearnerId } from '../../../identity';
class RoomApiError extends Error {
    status;
    constructor(status) {
        super(`Room API ${status}`);
        this.status = status;
    }
}
async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`/api${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            'X-Learner-Id': getLearnerId(),
            ...init.headers,
        },
    });
    if (!response.ok)
        throw new RoomApiError(response.status);
    return (await response.json());
}
export const getRoom = (sessionId) => request(`/sessions/${sessionId}/room`);
export const listHistory = (cursor?: string) => {
    const query = new URLSearchParams({ limit: '30' });
    if (cursor)
        query.set('cursor', cursor);
    return request(`/sessions?${query.toString()}`);
};
export const createTranscriptDraft = (sessionId, text, confidence) => request(`/sessions/${sessionId}/transcript-drafts`, {
    method: 'POST',
    body: JSON.stringify({
        text,
        adapter: 'browser-speech',
        locale: 'zh-TW',
        confidence: confidence ?? null,
    }),
});
export const confirmTranscriptDraft = (sessionId, draftId) => request(`/sessions/${sessionId}/transcript-drafts/${draftId}/confirm`, { method: 'POST' });
export const discardTranscriptDraft = (sessionId, draftId) => request(`/sessions/${sessionId}/transcript-drafts/${draftId}`, { method: 'DELETE' });
