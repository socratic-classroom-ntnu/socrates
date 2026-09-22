import type { TutorPresenceState } from '../model/types'

const labels: Record<TutorPresenceState, string> = {
  idle: '等待你的想法',
  listening: '正在聆聽',
  thinking: '正在整理問題',
  speaking: '正在回應',
}

export function AvatarStage({ state }: { state: TutorPresenceState }) {
  return (
    <section
      className="avatar-stage"
      data-avatar-id="brunette"
      data-avatar-state={state}
      aria-label="Socratic tutor avatar"
    >
      <div className="avatar-aura" />
      <div className="avatar-frame">
        <div className="css-avatar" aria-label="brunette avatar">
          <div className="avatar-hair avatar-hair-back" />
          <div className="avatar-neck" />
          <div className="avatar-face">
            <div className="avatar-hair avatar-hair-fringe" />
            <div className="avatar-eyes" />
            <div className="avatar-glasses avatar-glasses-left" />
            <div className="avatar-glasses avatar-glasses-right" />
            <div className="avatar-glasses-bridge" />
            <div className="avatar-nose" />
            <div className="avatar-mouth" />
          </div>
          <div className="avatar-shoulders" />
        </div>
        <span className="presence-pulse" />
      </div>
      <div className="avatar-caption">
        <strong>蘇格拉底導師</strong>
        <span>{labels[state]}</span>
      </div>
    </section>
  )
}
