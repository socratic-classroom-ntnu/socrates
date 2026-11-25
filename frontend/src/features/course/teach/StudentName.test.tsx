import { render } from '@testing-library/react'
import { StudentName } from './StudentName'

test('a deleted account shows as 已刪除的帳號 without a guest tag or number', () => {
  const { container } = render(<StudentName student={{ display_name: '', kind: 'deleted', guest_number: null }} />)

  expect(container).toHaveTextContent('已刪除的帳號')
  expect(container).not.toHaveTextContent('訪客')
})

test('an expired guest keeps its numbered placeholder and tag', () => {
  const { container } = render(<StudentName student={{ display_name: '', kind: 'expired_guest', guest_number: 2 }} />)

  expect(container).toHaveTextContent('過期訪客 2')
})
