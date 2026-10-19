import type { components } from '../../../api/classroomTypes'

export type SoloActivityView = components['schemas']['SoloActivityView']
export type SoloAttemptView = components['schemas']['SoloAttemptView']
export type SoloQuestion = components['schemas']['SoloQuestionView']
export type SoloMessage = components['schemas']['SoloMessageView']
export type SoloSummary = components['schemas']['PersonalSummaryView']
export type SoloAction = SoloAttemptView['available_actions'][number]

export function can(view: Pick<SoloAttemptView, 'available_actions'>, action: SoloAction): boolean {
  return view.available_actions.includes(action)
}

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index)
}

export function stanceLabel(question: SoloQuestion): string | null {
  if (!question.stance) return null
  const index = question.options.findIndex(option => option.id === question.stance?.option_id)
  if (index < 0) return null
  return `${optionLetter(index)} ${question.options[index].text}`
}

export function principleKey(value: SoloAttemptView['principle_hint']): 'consequentialism' | 'deontology' | 'mixed' | null {
  if (value === '後果主義') return 'consequentialism'
  if (value === '義務論') return 'deontology'
  if (value === '混合') return 'mixed'
  return null
}
