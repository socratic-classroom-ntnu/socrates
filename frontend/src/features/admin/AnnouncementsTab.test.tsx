import { fireEvent, render, screen, within } from '@testing-library/react'
import { createAnnouncement, deleteAnnouncement, listAnnouncements } from '../../contract/notificationClient'
import { AnnouncementsTab } from './AnnouncementsTab'

jest.mock('../../contract/notificationClient')

const all = {
  id: '123', title: '維護公告', content: '維護內容', audience: 'all' as const,
  published_by: 'admin', published_by_username: 'fizzy', published_at: 1760000000,
  maintenance_date: null, maintenance_start: null, maintenance_end: null,
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(listAnnouncements).mockResolvedValue([all])
  jest.mocked(createAnnouncement).mockImplementation(async input => ({ ...all, ...input, id: '456' }))
  jest.mocked(deleteAnnouncement).mockResolvedValue(null)
})

test('shows the author and requires confirmation before deleting', async () => {
  render(<AnnouncementsTab onError={jest.fn()} />)
  expect(await screen.findByText('fizzy')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '刪除' }))
  const dialog = screen.getByRole('dialog', { name: '刪除公告' })
  expect(deleteAnnouncement).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: '刪除' }))
  expect(await screen.findByText('還沒有公告')).toBeInTheDocument()
  expect(deleteAnnouncement).toHaveBeenCalledWith('123')
})

test('a publisher who deleted their account shows as a deleted account', async () => {
  jest.mocked(listAnnouncements).mockResolvedValue([{ ...all, published_by_username: null }])
  render(<AnnouncementsTab onError={jest.fn()} />)
  expect(await screen.findByText('已刪除的帳號')).toBeInTheDocument()
})

test('validates fields and immediately adds a published announcement', async () => {
  jest.mocked(listAnnouncements).mockResolvedValue([])
  await openPublishForm()
  expect(screen.getByRole('radio', { name: '全部' })).toBeChecked()
  expect(screen.getByRole('button', { name: '發布' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: '發布' }))
  expect(screen.getByText('請填寫標題，最多 40 字。')).toBeInTheDocument()
  expect(createAnnouncement).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('標題'), { target: { value: all.title } })
  fireEvent.change(screen.getByLabelText('內容'), { target: { value: all.content } })
  fireEvent.click(screen.getByRole('radio', { name: '學生' }))
  fireEvent.change(screen.getByLabelText('停機日期（選填）'), { target: { value: '2026-12-12' } })
  fireEvent.click(screen.getByRole('button', { name: '發布' }))
  expect(screen.getAllByText('請填寫完整的停機日期與起訖時間。')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('開始'), { target: { value: '06:00' } })
  fireEvent.change(screen.getByLabelText('結束'), { target: { value: '00:00' } })
  fireEvent.click(screen.getByRole('button', { name: '發布' }))
  expect(screen.getByText('結束時間必須晚於開始時間。')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('結束'), { target: { value: '07:00' } })
  fireEvent.click(screen.getByRole('button', { name: '發布' }))
  expect(await screen.findByText(all.title)).toBeInTheDocument()
  expect(createAnnouncement).toHaveBeenCalledWith({
    audience: 'student', title: all.title, content: all.content,
    maintenance_date: '2026-12-12', maintenance_start: '06:00', maintenance_end: '07:00',
  })
})

async function openPublishForm(onError = jest.fn()) {
  render(<AnnouncementsTab onError={onError} />)
  fireEvent.click(await screen.findByRole('button', { name: '新增公告' }))
}

test.each([
  ['全部', 'all'],
  ['老師', 'teacher'],
  ['學生', 'student'],
])('publishes to %s with free-form content and an optional maintenance window', async (label, value) => {
  await openPublishForm()
  fireEvent.click(screen.getByRole('radio', { name: label }))
  fireEvent.change(screen.getByLabelText('標題'), { target: { value: '公告' } })
  fireEvent.change(screen.getByLabelText('內容'), { target: { value: '  第一行\n第二行  ' } })
  fireEvent.click(screen.getByRole('button', { name: '發布' }))
  await screen.findByText('已發布 2 則')
  expect(screen.getAllByRole('cell', { name: all.title })).toHaveLength(1)
  const publishedRow = screen.getByRole('row', { name: new RegExp(` ${label} 公告 `) })
  expect(within(publishedRow).getByRole('cell', { name: label })).toBeInTheDocument()
  expect(createAnnouncement).toHaveBeenCalledWith({
    audience: value, title: '公告', content: '  第一行\n第二行  ',
    maintenance_date: null, maintenance_start: null, maintenance_end: null,
  })
})

test('blocks blank and over-limit title and content before publishing', async () => {
  await openPublishForm()
  fireEvent.click(screen.getByRole('button', { name: '發布' }))
  expect(screen.getByLabelText('標題')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('內容')).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(screen.getByLabelText('標題'), { target: { value: '題'.repeat(41) } })
  fireEvent.change(screen.getByLabelText('內容'), { target: { value: '字'.repeat(501) } })
  fireEvent.click(screen.getByRole('button', { name: '發布' }))
  expect(screen.getByLabelText('標題')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('內容')).toHaveAttribute('aria-invalid', 'true')
  expect(createAnnouncement).not.toHaveBeenCalled()
})

test('disables repeated submission and preserves the draft on a failed request', async () => {
  let fail: (cause: Error) => void = () => {}
  const onError = jest.fn()
  jest.mocked(createAnnouncement).mockReturnValueOnce(new Promise((_, reject) => { fail = reject }))
  await openPublishForm(onError)
  fireEvent.change(screen.getByLabelText('標題'), { target: { value: '公告' } })
  fireEvent.change(screen.getByLabelText('內容'), { target: { value: '內容' } })
  const publish = screen.getByRole('button', { name: '發布' })
  const form = publish instanceof HTMLButtonElement ? publish.form : null
  if (!form) throw new Error('Publish button must submit the announcement form')
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(screen.getByRole('button', { name: '發布中…' })).toBeDisabled()
  expect(screen.getByRole('radio', { name: '全部' })).toBeDisabled()
  expect(createAnnouncement).toHaveBeenCalledTimes(1)
  const error = new Error('offline')
  fail(error)
  expect(await screen.findByRole('alert')).toHaveTextContent('無法發布公告，請再試一次。')
  expect(screen.getByLabelText('標題')).toHaveValue('公告')
  expect(screen.getByRole('button', { name: '發布' })).toBeEnabled()
  expect(onError).toHaveBeenCalledWith(error)
})
