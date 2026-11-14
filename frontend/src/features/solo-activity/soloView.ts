import type { components } from '../../contract/classroomTypes'

export type SoloActivityView = components['schemas']['SoloActivityView']
export type SoloAttemptView = components['schemas']['SoloAttemptView']
export type SoloScenario = components['schemas']['SoloScenarioView']
export type SoloMessage = components['schemas']['SoloMessageView']
export type SoloSummary = components['schemas']['PersonalSummaryView']
export type SoloSendMessageBody = components['schemas']['SendMessageBody']
export type SoloAction = SoloAttemptView['available_actions'][number]

/** States after the last scenario: the review and its final summary (O6) replace the composer. */
export const REVIEW_STATES: ReadonlyArray<SoloAttemptView['state']> = ['reviewing', 'awaiting_reflection_prompt', 'reflecting', 'completed']

export function can(view: Pick<SoloAttemptView, 'available_actions'>, action: SoloAction): boolean {
  return view.available_actions.includes(action)
}

export function currentScenario(view: Pick<SoloAttemptView, 'scenarios' | 'scenario_index'>): SoloScenario | undefined {
  return view.scenarios.find(item => item.index === view.scenario_index)
}

export function principleKey(value: SoloAttemptView['principle_hint']): 'consequentialism' | 'deontology' | 'mixed' | null {
  if (value === '後果主義') return 'consequentialism'
  if (value === '義務論') return 'deontology'
  if (value === '混合') return 'mixed'
  return null
}
