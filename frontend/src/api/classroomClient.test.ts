import { ApiError, RECENT_API_ERROR_LIMIT, api, command, importYAML, recentApiErrors, recordApiError, setCSRF } from './classroomClient';
afterEach(() => jest.restoreAllMocks());
test('Classroom command carries one stable action identity and same-origin credentials', async () => {
    const fn = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ status: 'RECORDED' }) });
    globalThis.fetch = fn;
    setCSRF('csrf-fixture');
    await command('room', 'answer', { option_id: 'a' }, '11111111-1111-4111-8111-111111111111');
    expect(fn).toHaveBeenCalledWith('/api/v2/classrooms/room/commands', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }));
    const init = fn.mock.calls[0][1];
    expect(JSON.parse(init.body).action_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(init.headers['X-CSRF-Token']).toBe('csrf-fixture');
});
test('Classroom API presents domain error without converting it to a successful receipt', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 409, headers: { get: () => 'application/json' }, json: async () => ({ detail: 'ACTION_ID_PAYLOAD_CONFLICT' }) });
    await expect(api('/classrooms/r', 'POST', {})).rejects.toMatchObject({
        message: '這個操作已經用不同內容送出過，請重新整理後再試。',
        detail: 'ACTION_ID_PAYLOAD_CONFLICT',
        status: 409,
    });
});

test('YAML import sends the source text with the YAML content type', async () => {
    const fn = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ id: 'script-1', revision: 1 }) });
    globalThis.fetch = fn;
    await importYAML('title: 測試\nmode: static\nquestions: []\n');
    const init = fn.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/yaml');
    expect(init.body).toContain('title: 測試');
});
test('non-JSON upstream response shows a readable recovery message', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 530, headers: { get: () => 'text/plain; charset=UTF-8' }, text: async () => 'error code: 1033' });
    await expect(api('/scripts')).rejects.toThrow('服務正在恢復（HTTP 530），請稍後重試。');
});

// 開發控制台的錯誤紀錄：只留最近 20 筆，最新的在前
test('recent API errors keep only the newest entries', () => {
    for (let i = 0; i < RECENT_API_ERROR_LIMIT + 5; i++)
        recordApiError(new ApiError(400 + (i % 100), `CODE_${i}`), { method: 'get', path: `/api/v2/x/${i}` });
    const recent = recentApiErrors();
    expect(recent).toHaveLength(RECENT_API_ERROR_LIMIT);
    expect(recent[0]).toMatchObject({ method: 'GET', path: '/api/v2/x/24', code: 'CODE_24' });
    expect(recent[RECENT_API_ERROR_LIMIT - 1].code).toBe('CODE_5');
});
