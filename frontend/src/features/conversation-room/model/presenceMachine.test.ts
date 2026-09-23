
import { projectPresence } from './presenceMachine'

describe('projectPresence', () => {
  it('gives listening input priority', () => {
    expect(projectPresence('listening', 'thinking')).toBe('listening')
  })

  it('projects thinking and speaking', () => {
    expect(projectPresence('idle', 'thinking')).toBe('thinking')
    expect(projectPresence('idle', 'speaking')).toBe('speaking')
  })
})
