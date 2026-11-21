import { render, screen } from '@testing-library/react';
import { FocusNotice } from './FocusNotice';

test('導師暫停回應時顯示後端給的原因', () => {
    render(<FocusNotice status="TUTOR_UNAVAILABLE" message="導師暫停回應：本教室的 LLM 額度已達上限。" />);
    expect(screen.getByRole('status')).toHaveTextContent('LLM 額度已達上限');
});

test('其他狀態不顯示提示', () => {
    const { container } = render(<FocusNotice status="AWAITING_STUDENT" message="下一題正在準備" />);
    expect(container).toBeEmptyDOMElement();
});

test('沒有訊息時不顯示空的提示', () => {
    const { container } = render(<FocusNotice status="TUTOR_UNAVAILABLE" message={null} />);
    expect(container).toBeEmptyDOMElement();
});
