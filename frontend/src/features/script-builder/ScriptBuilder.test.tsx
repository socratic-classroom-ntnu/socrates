import { newDocument } from './ScriptBuilder';

test('教師的 Live LLM 額度預設為 240', () => {
    expect(newDocument().live_llm_call_budget).toBe(240);
});
