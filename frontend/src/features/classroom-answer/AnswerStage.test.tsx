import { act, fireEvent, render, screen } from '@testing-library/react';
import { AnswerStage } from './AnswerStage';

const options = [
    { id: 'a', text: '對，結果比原則重要' },
    { id: 'b', text: '不一定，要看對象是誰' },
    { id: 'c', text: '不對，誠實是底線' },
    { id: 'd', text: '我還無法判斷' },
];

function renderStage(overrides = {}) {
    const props = {
        questionNumber: 1, questionCount: 5, title: '如果說謊能讓一個人免於痛苦，說謊是對的嗎？', scenario: '',
        options, choice: '', writing: false, onChoose: jest.fn(), onReselect: jest.fn(),
        deadline: Date.now() / 1000 + 30, duration: 60, offset: { current: 0 },
        composer: <textarea aria-label="為什麼？寫下你的想法"/>, ...overrides,
    };
    return { ...render(<AnswerStage {...props}/>), props };
}

describe('AnswerStage', () => {
    it('第三頁：題號、題目與後端給的選項', () => {
        renderStage();
        expect(screen.getByText('Q1 / 5')).toBeInTheDocument();
        expect(screen.getByText('第 1 題')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '如果說謊能讓一個人免於痛苦，說謊是對的嗎？' })).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /^[A-D]/ })).toHaveLength(4);
        expect(screen.getByRole('timer')).toHaveAccessibleName('剩餘 30 秒');
    });

    it('點選項立刻切到第四頁，不等動畫', () => {
        const { props } = renderStage();
        fireEvent.click(screen.getByRole('button', { name: /不一定，要看對象是誰/ }));
        expect(props.onChoose).toHaveBeenCalledWith('b');
    });

    it('第四頁：選定卡、未選小卡可改選、換一個倒著播完才回到選項', () => {
        const { props } = renderStage({ choice: 'b', writing: true });
        expect(screen.getByText('你的選擇')).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: '為什麼？寫下你的想法' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '改選 C：不對，誠實是底線' }));
        expect(props.onChoose).toHaveBeenCalledWith('c');
        jest.useFakeTimers();
        fireEvent.click(screen.getByRole('button', { name: '換一個' }));
        expect(props.onReselect).not.toHaveBeenCalled();
        act(() => { jest.advanceTimersByTime(420); });
        expect(props.onReselect).toHaveBeenCalled();
        jest.useRealTimers();
    });

    it('倒數到 0 時提示時間到', () => {
        renderStage({ deadline: Date.now() / 1000 - 1 });
        expect(screen.getByRole('status')).toHaveTextContent('時間到');
    });

    it('情境預設收起，按了才展開', () => {
        renderStage({ scenario: '你的朋友罹患重病……' });
        expect(screen.queryByText('你的朋友罹患重病……')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '閱讀情境' }));
        expect(screen.getByText('你的朋友罹患重病……')).toBeInTheDocument();
    });
});
