import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from '../../testkit';
import Summary from './Summary';
const payload = {
    discussion_topic: '電車難題：選擇、責任與原則',
    core_principle: '降低可避免的傷害',
    key_points: ['人數會影響判斷', '介入方式也重要'],
    tension: '結果與責任之間的張力',
    reflection_excerpt: '我會轉向。',
    stage_outcomes: [{ index: 0, status: 'goal_met', title: '失控的電車' }],
};
describe('Summary issue #3', () => {
    it('renders topic, summary, key points and exits', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
        render(<MemoryRouter initialEntries={['/sessions/s1/summary']}><Routes><Route path="/sessions/:sessionId/summary" element={<Summary />}/></Routes></MemoryRouter>);
        expect(await screen.findByTestId('discussion-topic')).toHaveTextContent('電車難題');
        expect(screen.getByTestId('discussion-key-points')).toHaveTextContent('人數會影響判斷');
        expect(screen.getByTestId('summary-exit')).toBeInTheDocument();
    });
    // 「退出至首頁」離開單人對話回共思教室首頁：整頁載入（一般連結），不被本頁路由器的 "/"（Round 1 首頁）攔下
    it('formal route never exposes preview statistics', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
        render(<MemoryRouter initialEntries={['/sessions/s1/summary']}><Routes><Route path="/sessions/:sessionId/summary" element={<Summary />}/></Routes></MemoryRouter>);
        fireEvent.click(await screen.findByRole('button', { name: /失控的電車/ }));
        expect(screen.queryByText('結果比原則重要')).toBeNull();
        expect(screen.getByRole('status')).toHaveTextContent('想清楚了');
    });

    it('退出至首頁 is a full-page link to the classroom home', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
        jest.spyOn(console, 'error').mockImplementation(() => undefined); // jsdom 不實作整頁導覽
        render(<MemoryRouter initialEntries={['/sessions/s1/summary']}><Routes>
          <Route path="/sessions/:sessionId/summary" element={<Summary />}/>
          <Route path="/" element={<p>本頁路由器的首頁</p>}/>
        </Routes></MemoryRouter>);
        const exit = await screen.findByRole('link', { name: '退出至首頁' });
        expect(exit).toHaveAttribute('href', '/');
        expect(screen.getByRole('button', { name: '回到歷史紀錄' })).toBeInTheDocument();
        expect(fireEvent.click(exit)).toBe(true);
        expect(screen.queryByText('本頁路由器的首頁')).toBeNull();
    });
});
