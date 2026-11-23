import { render } from '@testing-library/react'
import type { components } from '../../contract/classroomTypes'
import { SenderText } from './FeedbackTable'

type Item = components['schemas']['FeedbackItem']

function item(overrides: Partial<Item>): Item {
  return {
    id: 'f-1', created_at: 0, kind: null, message: 'hi', page: '/', contact: null,
    identity: 'student', account_kind: 'registered', account_name: 'learner',
    has_screenshot: false, user_agent: '', ...overrides,
  } as Item
}

test('a sender who deleted their account is shown as 已刪除的帳號', () => {
  const { container } = render(<SenderText item={item({ account_kind: 'deleted', account_name: null })} />)

  expect(container).toHaveTextContent('已刪除的帳號')
})

test('a registered sender shows their username', () => {
  const { container } = render(<SenderText item={item({})} />)

  expect(container).toHaveTextContent('learner')
})
