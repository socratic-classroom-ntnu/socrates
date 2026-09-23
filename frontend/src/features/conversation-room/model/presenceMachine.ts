import type { InputState, TutorPresenceState, TutorState } from './types'

export function projectPresence(
  inputState: InputState,
  tutorState: TutorState,
): TutorPresenceState {
  if (inputState === 'listening' || inputState === 'transcribing') return 'listening'
  if (tutorState === 'thinking') return 'thinking'
  if (tutorState === 'speaking') return 'speaking'
  return 'idle'
}
