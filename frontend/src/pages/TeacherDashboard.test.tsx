import { fireEvent, render, screen, within } from '@testing-library/react'
import { TeacherDashboard, greeting } from './TeacherDashboard'
import { ApiError, api } from '../api/classroomClient'

jest.mock('../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../api/classroomClient')>('../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn() }
})

const evening = new Date(2026, 9, 6, 20, 0)

beforeEach(() => {
  jest.mocked(api).mockReset()
})

test('greets by time of day', () => {
  expect(greeting(8)).toBe('早安')
  expect(greeting(14)).toBe('午安')
  expect(greeting(20)).toBe('晚安')
  expect(greeting(2)).toBe('晚安')
})

test('lists each course as a card that links to its workspace', async () => {
  jest.mocked(api).mockResolvedValue([
    { id: 'c-1', title: '科技倫理', revision: 1 },
    { id: 'c-2', title: '科技系統與社會發展 A', revision: 3 },
  ])
  render(<TeacherDashboard user={{ username: 'Fizzy' }} now={evening} />)

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('晚安！Fizzy老師')
  const link = await screen.findByRole('link', { name: '科技倫理' })
  expect(link).toHaveAttribute('href', '/teacher/courses/c-1')
  expect(screen.getByRole('link', { name: '科技系統與社會發展 A' })).toBeInTheDocument()
  expect(api).toHaveBeenCalledWith('/library/classrooms')
})

// 資料來源還沒定案的欄位要明白顯示「沒有」，不能顯示成 0 讓老師以為真的沒有學生
test('shows a dash for stats and no copy button when the course has no code yet', async () => {
  jest.mocked(api).mockResolvedValue([{ id: 'c-1', title: '科技倫理', revision: 1 }])
  render(<TeacherDashboard user={{ username: 'Fizzy' }} now={evening} />)

  const card = (await screen.findByRole('link', { name: '科技倫理' })).closest('article')
  expect(within(card).getByText('學生人數').nextSibling).toHaveTextContent('—')
  expect(within(card).getByText('尚無課程碼')).toBeInTheDocument()
  expect(within(card).queryByRole('button', { name: /複製課程碼/ })).toBeNull()
})

test('creating a course retries with the same action id and refreshes the list', async () => {
  jest
    .mocked(api)
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new ApiError(503, '暫時無法連線'))
    .mockResolvedValueOnce({ id: 'c-9', title: '科技倫理', revision: 1 })
    .mockResolvedValueOnce([{ id: 'c-9', title: '科技倫理', revision: 1 }])
  render(<TeacherDashboard user={{ username: 'Fizzy' }} now={evening} />)

  fireEvent.click(await screen.findByRole('button', { name: /建立課程/ }))
  fireEvent.change(screen.getByLabelText('課程名稱'), { target: { value: ' 科技倫理 ' } })
  fireEvent.click(screen.getByRole('button', { name: '建立' }))
  expect(await screen.findByText('暫時無法連線')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '建立' }))
  expect(await screen.findByRole('link', { name: '科技倫理' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).toBeNull()

  const posts = jest.mocked(api).mock.calls.filter(([, method]) => method === 'POST')
  expect(posts).toHaveLength(2)
  expect(posts[0][2]).toMatchObject({ title: '科技倫理' })
  expect(posts[1][2].action_id).toBe(posts[0][2].action_id)
})
