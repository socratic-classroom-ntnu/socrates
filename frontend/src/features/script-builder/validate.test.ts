import { fieldErrorsFrom422, validateDocument } from './validate';
import { newDocument } from './ScriptBuilder';

test('a new document passes the backend limits', () => {
    expect(validateDocument(newDocument())).toEqual([]);
});

test('reports each field that breaks a ScriptDocument limit, by path', () => {
    const doc = newDocument();
    doc.title = '  ';
    doc.preview_seconds = 11;
    doc.questions[0].options = [{ id: 'a', text: '只有一個' }];
    doc.questions[0].duration_seconds = 0;
    doc.questions[0].receiver_point_cap = -1;
    doc.questions[0].max_focus_turns = 1.5;
    const errors = validateDocument(doc);
    expect(errors.map(e => e.path)).toEqual([
        'title', 'preview_seconds', 'questions.0.options', 'questions.0.duration_seconds',
        'questions.0.max_focus_turns', 'questions.0.receiver_point_cap',
    ]);
    expect(errors[0].message).toBe('劇本名稱請填寫');
    expect(errors[1].message).toBe('預覽秒數最多 10');
    expect(errors[2].message).toBe('情境 1 的選項至少要 2 個');
    expect(errors[3].message).toBe('情境 1 的作答秒數至少 1');
    expect(errors[4].message).toBe('情境 1 的每位代表最多來回請填整數');
});

test('personal dialogue limits follow the Question model; older drafts without them still pass', () => {
    const doc = newDocument();
    doc.questions[0].max_personal_turns = 21;
    doc.questions[0].personal_seconds = 10;
    expect(validateDocument(doc)).toEqual([
        { path: 'questions.0.max_personal_turns', message: '情境 1 的個人對話回覆上限最多 20' },
        { path: 'questions.0.personal_seconds', message: '情境 1 的個人對話秒數至少 30' },
    ]);
    delete doc.questions[0].max_personal_turns;
    delete doc.questions[0].personal_seconds;
    expect(validateDocument(doc)).toEqual([]);
});

test('an empty question list and over-long text are both caught', () => {
    const doc = newDocument();
    doc.title = 'x'.repeat(301);
    doc.questions = [];
    expect(validateDocument(doc)).toEqual([
        { path: 'title', message: '劇本名稱最多 300 字' },
        { path: 'questions', message: '至少要有 1 題' },
    ]);
});

test('a 422 detail list becomes readable field messages', () => {
    const errors = fieldErrorsFrom422([
        { loc: ['body', 'document', 'questions', 0, 'options'], msg: 'List should have at least 2 items after validation, not 1', type: 'too_short', ctx: { field_type: 'List', min_length: 2, actual_length: 1 } },
        { loc: ['body', 'document', 'questions', 1, 'options', 2, 'text'], msg: 'String should have at least 1 character', type: 'string_too_short', ctx: { min_length: 1 } },
        { loc: ['body', 'document', 'preview_seconds'], msg: 'Input should be less than or equal to 10', type: 'less_than_equal', ctx: { le: 10 } },
        { loc: ['body', 'document', 'mode'], msg: "Input should be 'static' or 'dynamic'", type: 'literal_error', ctx: { expected: "'static' or 'dynamic'" } },
    ]);
    expect(errors).toEqual([
        { path: 'questions.0.options', message: '情境 1・選項：至少要 2 個' },
        { path: 'questions.1.options.2.text', message: '情境 2・選項 3・文字：請填寫' },
        { path: 'preview_seconds', message: '預覽秒數：最多 10' },
        { path: 'mode', message: "題目模式：請使用 'static' 或 'dynamic'" },
    ]);
    expect(fieldErrorsFrom422('API 422')).toEqual([]);
});

// 範例題目加入時是兩列空白選項：只報「選項至少要 2 個」這一條，不再逐列報「請填寫」
test('blank option rows do not count toward the two-option minimum', () => {
    const doc = newDocument();
    doc.questions[0].options = [{ id: 'a', text: '' }, { id: 'b', text: '  ' }];
    expect(validateDocument(doc)).toEqual([{ path: 'questions.0.options', message: '情境 1 的選項至少要 2 個' }]);
    doc.questions[0].options = [{ id: 'a', text: '轉向' }, { id: 'b', text: '不轉向' }, { id: 'c', text: '' }];
    expect(validateDocument(doc)).toEqual([{ path: 'questions.0.options.2.text', message: '情境 1 的選項 3請填寫' }]);
});
