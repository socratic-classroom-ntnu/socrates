import { CSSProperties, MutableRefObject, ReactNode, useEffect, useRef, useState } from 'react';
import { useCountdown, useFitOneLine, useFitText, useIsMobile, useStageScale } from './stage';
import './answerStage.css';

// Figma「3 問題作答」→「4 選定並寫下想法」。資料與送出邏輯留在 ClassroomApp 的 AnswerPanel，這裡只負責畫面與轉場。

// OptionCard 的四個顏色與旋轉角度，選項超過四個時循環使用
const COLORS = ['#C8431A', '#27408B', '#E3A72F', '#0F6B5F'];
const ROTATIONS = [-2, 1, -1, 2];
const CHIP_ROTATIONS = [-3, 2, -1];
const DARK_TEXT = '#E3A72F';

// 第三頁選項卡（寬 280、間距 18、置中、top 614）與第四頁選定卡（220,588 360×180）的中心點，
// 兩者的差就是選定卡飛入的起點
const slotCenter = (index: number, count: number) => {
  const width = count * 280 + (count - 1) * 18;
  return { x: 640 - width / 2 + index * 298 + 140, y: 614 + 75 };
};
const CARD_CENTER = { x: 220 + 180, y: 588 + 90 };
// Other options 的小卡（150×46，間距 8，最後一張底部在 760）共 n 張時第 k 張的中心點
const chipCenter = (k: number, n: number) => ({ x: 44 + 75, y: 760 - (n - 1 - k) * 54 - 23 });

// 按「換一個」時，第四頁倒著播回第三頁的時間，要和 answerStage.css 的 ce-writing--leave 一致
const LEAVE_MS = 420;

export interface StageOption {
  id: string;
  text: string;
}

interface AnswerStageProps {
  questionNumber: number;
  questionCount: number;
  title: string;
  scenario: string;
  options: StageOption[];
  choice: string;
  writing: boolean;
  onChoose: (optionId: string) => void;
  onReselect: () => void;
  deadline: number | null;
  duration: number;
  offset: MutableRefObject<number>;
  composer: ReactNode;
}

const letter = (index: number) => String.fromCharCode(65 + index);
const cardStyle = (index: number) => ({ '--option-color': COLORS[index % COLORS.length], '--rotation': `${ROTATIONS[index % ROTATIONS.length]}deg` }) as CSSProperties;
const darkText = (index: number) => COLORS[index % COLORS.length] === DARK_TEXT;

// 字級上下限（px）：卡片文字以「縮小字體留在一行」優先，縮到下限才換行
const FIT = {
  option: { desktop: [23, 15], many: [19, 14], mobile: [18, 13] },
  selected: { desktop: [32, 20], mobile: [26, 18] },
  chip: { desktop: [16, 12], mobile: [15, 12] },
} as const;

function FitLine({ text, className, max, min, wrap = true }: { text: string; className: string; max: number; min: number; wrap?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useFitOneLine(ref, text, max, min, wrap);
  return <span className={className} ref={ref}>{text}</span>;
}

export function AnswerStage(props: AnswerStageProps) {
  const { questionNumber, questionCount, title, scenario, options, choice, writing, onChoose, onReselect, deadline, duration, offset, composer } = props;
  const mobile = useIsMobile();
  const canvas = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  const question = useRef<HTMLHeadingElement>(null);
  useStageScale(canvas, mobile);
  const index = useRef<HTMLSpanElement>(null);
  useFitText(board, index, question, title, mobile);

  const seconds = useCountdown(deadline, offset);
  const timeUp = Boolean(deadline) && seconds === 0;
  const progress = duration > 0 ? Math.min(100, (seconds / duration) * 100) : 0;

  // 只有在這個畫面裡切換時才播轉場；重新整理後直接停在對應的畫面
  const [transition, setTransition] = useState<'none' | 'toWriting' | 'toOptions'>('none');
  // 情境在第三頁預設展開：學生要先讀完整的情境才選立場；進到寫想法時收起，需要時再打開
  const [scenarioOpen, setScenarioOpen] = useState(() => !writing);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  // 點下去立刻切到第四頁，由選定卡從原本的位置飛過去銜接，不等離場動畫
  function choose(optionId: string) {
    setScenarioOpen(false);
    setTransition('toWriting');
    onChoose(optionId);
  }

  // 換一個：第四頁倒著播（選定卡飛回原位、小卡回到各自的位置、筆記紙滑下），播完再切回選項
  function reselect() {
    if (leaving) return;
    setLeaving(true);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    leaveTimer.current = window.setTimeout(() => {
      setLeaving(false);
      setTransition('toOptions');
      onReselect();
    }, reduceMotion ? 0 : LEAVE_MS);
  }

  const selectedIndex = options.findIndex(o => o.id === choice);
  const selected = options[selectedIndex];
  const showWriting = writing && selected;
  const [optionMax, optionMin] = mobile ? FIT.option.mobile : options.length > 4 ? FIT.option.many : FIT.option.desktop;
  const [selectedMax, selectedMin] = mobile ? FIT.selected.mobile : FIT.selected.desktop;
  const [chipMax, chipMin] = mobile ? FIT.chip.mobile : FIT.chip.desktop;
  const from = slotCenter(Math.max(0, selectedIndex), options.length);

  return (
    <div className={`ce-room${mobile ? ' ce-room--mobile' : ''}`}>
      <div className="ce-canvas" ref={canvas}>
        <div className="ce-bg-scene" aria-hidden="true"/>

        <div className="ce-progress">
          <span className="ce-seal" aria-hidden="true">問</span>
          <span className="ce-progress-text">Q{questionNumber} / {questionCount}</span>
        </div>

        <div className={`ce-timer${timeUp ? ' ce-timer--up' : ''}`}>
          <div className="ce-timer-ring" role="timer" aria-label={`剩餘 ${seconds} 秒`} style={{ '--progress': `${progress}%` } as CSSProperties}>
            <div className="ce-timer-face">
              <span className="ce-timer-value">{seconds}</span>
              <span className="ce-timer-unit">秒</span>
            </div>
          </div>
          {timeUp && <span className="ce-time-up" role="status">時間到</span>}
        </div>

        <section className="ce-chalkboard" ref={board} aria-label="目前題目">
          <span className="ce-q-index" ref={index}>第 {questionNumber} 題</span>
          <h1 className="ce-q-text" ref={question}>{title}</h1>
        </section>

        {scenario && scenario !== title && (
          <div className="ce-scenario">
            <button type="button" className="ce-scenario-toggle" aria-expanded={scenarioOpen} onClick={() => setScenarioOpen(open => !open)}>
              {scenarioOpen ? '收起情境' : '閱讀情境'}
            </button>
            {scenarioOpen && <p className="ce-scenario-text">{scenario}</p>}
          </div>
        )}

        {!showWriting ? (
          <div
            className={`ce-options${options.length > 4 ? ' ce-options--many' : ''}${transition === 'toOptions' ? ' ce-options--return' : ''}`}
            role="group"
            aria-label="選擇你的立場"
            style={{ '--count': options.length } as CSSProperties}
          >
            {options.map((option, i) => (
              <button
                key={option.id}
                type="button"
                className={`ce-option${darkText(i) ? ' ce-option--dark' : ''}${option.id === choice ? ' ce-option--previous' : ''}`}
                style={cardStyle(i)}
                onClick={() => choose(option.id)}
              >
                <span className="ce-option-letter">{letter(i)}</span>
                <FitLine className="ce-option-text" text={option.text} max={optionMax} min={optionMin}/>
              </button>
            ))}
          </div>
        ) : (
          <div className={`ce-writing${leaving ? ' ce-writing--leave' : transition === 'toWriting' ? ' ce-writing--enter' : ''}`}>
            <div className="ce-other-options" role="group" aria-label="改選其他選項">
              {options.filter(o => o.id !== choice).map(option => {
                const i = options.indexOf(option);
                const k = options.filter(o => o.id !== choice).indexOf(option);
                const chip = chipCenter(k, options.length - 1), slot = slotCenter(i, options.length);
                return (
                <button
                  key={option.id}
                  type="button"
                  className={`ce-chip${darkText(i) ? ' ce-option--dark' : ''}`}
                  style={{
                    ...cardStyle(i),
                    '--rotation': `${CHIP_ROTATIONS[k % CHIP_ROTATIONS.length]}deg`,
                    '--to-x': `${slot.x - chip.x}px`,
                    '--to-y': `${slot.y - chip.y}px`,
                  } as CSSProperties}
                  aria-label={`改選 ${letter(i)}：${option.text}`}
                  onClick={() => { setTransition('toWriting'); onChoose(option.id); }}
                >
                  <span className="ce-chip-letter">{letter(i)}</span>
                  <FitLine className="ce-chip-text" text={option.text} max={chipMax} min={chipMin} wrap={false}/>
                </button>
                );
              })}
            </div>

            <div
              key={choice}
              className={`ce-selected${darkText(selectedIndex) ? ' ce-option--dark' : ''}`}
              style={{
                ...cardStyle(selectedIndex),
                '--from-x': `${from.x - CARD_CENTER.x}px`,
                '--from-y': `${from.y - CARD_CENTER.y}px`,
              } as CSSProperties}
            >
              <div className="ce-selected-top">
                <span className="ce-selected-letter">{letter(selectedIndex)}</span>
                <div className="ce-selected-meta">
                  <span className="ce-selected-label">你的選擇</span>
                  <button type="button" className="ce-reselect" onClick={reselect}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>
                    </svg>
                    換一個
                  </button>
                </div>
              </div>
              <FitLine className="ce-selected-text" text={selected.text} max={selectedMax} min={selectedMin}/>
            </div>

            <div className="ce-notebook">
              <span className="ce-notebook-label" aria-hidden="true">為什麼？寫下你的想法</span>
              {composer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
