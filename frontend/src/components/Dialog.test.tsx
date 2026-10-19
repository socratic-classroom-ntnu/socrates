import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Dialog } from './Dialog'

function Harness({ closeOnBackdrop, second = false }: { closeOnBackdrop?: boolean; second?: boolean }) {
  const [open, setOpen] = useState(false)
  const [inner, setInner] = useState(second)
  return <>
    <button onClick={() => setOpen(true)}>開啟</button>
    <a href="#behind">背後的連結</a>
    {open && <Dialog title="測試對話框" onClose={() => setOpen(false)} closeOnBackdrop={closeOnBackdrop}
      footer={<button onClick={() => setOpen(false)}>完成</button>}>
      <p>說明文字</p>
      <input aria-label="欄位" />
      {inner && <Dialog title="上層對話框" onClose={() => setInner(false)}><button>上層按鈕</button></Dialog>}
    </Dialog>}
  </>
}

function openDialog(props: { closeOnBackdrop?: boolean; second?: boolean } = {}) {
  render(<Harness {...props} />)
  const opener = screen.getByRole('button', { name: '開啟' })
  opener.focus()
  fireEvent.click(opener)
  return opener
}

test('focus starts inside and Escape closes, returning focus to the opener', () => {
  const opener = openDialog()
  expect(screen.getByRole('button', { name: '關閉' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('button', { name: '關閉' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(opener).toHaveFocus()
})

test('the close button closes', () => {
  openDialog()
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('Escape closes even when focus fell to body', () => {
  openDialog()
  ;(document.activeElement as HTMLElement).blur()
  expect(document.body).toHaveFocus()
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('Tab from outside returns focus into the dialog', () => {
  openDialog()
  ;(document.activeElement as HTMLElement).blur()
  fireEvent.keyDown(document.body, { key: 'Tab' })
  expect(screen.getByRole('button', { name: '關閉' })).toHaveFocus()
  ;(document.activeElement as HTMLElement).blur()
  fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true })
  expect(screen.getByRole('button', { name: '完成' })).toHaveFocus()
})

test('Tab wraps inside the dialog', () => {
  openDialog()
  screen.getByRole('button', { name: '完成' }).focus()
  fireEvent.keyDown(screen.getByRole('button', { name: '完成' }), { key: 'Tab' })
  expect(screen.getByRole('button', { name: '關閉' })).toHaveFocus()
})

test('the panel itself can take focus', () => {
  openDialog()
  expect(screen.getByRole('dialog')).toHaveAttribute('tabindex', '-1')
})

test('backdrop click closes by default', () => {
  openDialog()
  fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('backdrop click does nothing when closeOnBackdrop is false', () => {
  openDialog({ closeOnBackdrop: false })
  fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('Escape only closes the topmost dialog', () => {
  openDialog({ second: true })
  ;(document.activeElement as HTMLElement).blur()
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: '上層對話框' })).toBeNull()
  expect(screen.getByRole('dialog', { name: '測試對話框' })).toBeInTheDocument()
})
