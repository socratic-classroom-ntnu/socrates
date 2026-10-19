import { PERSONAL_STATUS_TEXT } from '../../shared/personalStatus';

// 教師端：單一組別在目前題目的立場分布（後端 GET /groups/classrooms/{id}?mode=teacher 的 groups[].stance）。
// 人數只計學生已確認的基準；沒有基準的人依個人對話狀態另外計數。
export type StanceOption = { option_id: string; text: string; count: number; percent: number };
export type GroupStanceData = {
    question_index: number;
    question_title: string;
    members: number;
    confirmed: number;
    unconfirmed: number;
    unconfirmed_by_status: Record<string, number>;
    options: StanceOption[];
    differing: boolean;
};

const UNCONFIRMED_TEXT: Record<string, string> = { ...PERSONAL_STATUS_TEXT, not_answered: '未作答' };

export function GroupStance({ stance }: { stance?: GroupStanceData | null }) {
    if (!stance)
        return <p className="group-stance-empty">題目尚未開始，還沒有立場分布。</p>;
    const badge = stance.confirmed === 0 ? '尚無確認' : stance.differing ? '立場分歧' : '立場一致';
    const tone = stance.confirmed === 0 ? 'none' : stance.differing ? 'split' : 'same';
    const reasons = Object.entries(stance.unconfirmed_by_status || {}).filter(([, n]) => n > 0)
        .map(([status, n]) => `${UNCONFIRMED_TEXT[status] || status} ${n}`).join(' · ');
    return <section className="group-stance" aria-label={`第 ${stance.question_index + 1} 題立場分布`}>
      <p className="group-stance-head"><small>第 {stance.question_index + 1} 題立場 · 已確認 {stance.confirmed} / {stance.members}</small><strong className={'group-stance-badge ' + tone}>{badge}</strong></p>
      <ul>{stance.options.map(o => <li key={o.option_id}>
        <span className="group-stance-label">{o.text}</span>
        <span className="group-stance-bar" aria-hidden="true"><span style={{ width: `${o.percent}%` }}/></span>
        <span className="group-stance-count">{o.count} 人</span>
      </li>)}</ul>
      <p className="group-stance-foot">未確認 {stance.unconfirmed}{reasons && `（${reasons}）`}</p>
    </section>;
}
