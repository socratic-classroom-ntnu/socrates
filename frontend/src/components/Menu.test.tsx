import { act, fireEvent, render, screen } from '@testing-library/react'
import { Menu, type MenuItem } from './Menu'

function setup(extra: Partial<Record<string, jest.Mock>> = {}) {
  const edit = extra.edit ?? jest.fn()
  const remove = extra.remove ?? jest.fn()
  const english = jest.fn()
  const items: MenuItem[] = [
    { key: 'edit', label: '編輯', onSelect: edit },
    { key: 'lang', label: '語言', onSelect: () => {}, submenu: [
      { key: 'zh', label: '繁體中文', onSelect: () => {}, checked: true },
      { key: 'en', label: 'English', onSelect: english, checked: false },
    ] },
    { key: 'remove', label: '刪除活動', onSelect: remove, danger: true, dividerBefore: true },
  ]
  render(<div><button>outside</button><Menu label="活動操作" trigger="⋯" items={items} /></div>)
  return { edit, remove, english }
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: '活動操作' }))
  return screen.getByRole('menu', { name: '活動操作' })
}

test('opens with focus on the first item and arrows move focus', () => {
  setup()
  const trigger = screen.getByRole('button', { name: '活動操作' })
  expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  const menu = openMenu()
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('menuitem', { name: '編輯' })).toHaveFocus()
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  expect(screen.getByRole('menuitem', { name: '語言' })).toHaveFocus()
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  expect(screen.getByRole('menuitem', { name: '編輯' })).toHaveFocus()
  fireEvent.keyDown(menu, { key: 'ArrowUp' })
  expect(screen.getByRole('menuitem', { name: '刪除活動' })).toHaveFocus()
})

test('Enter selects the focused item and closes the menu', () => {
  const { edit } = setup()
  const menu = openMenu()
  fireEvent.keyDown(menu, { key: 'Enter' })
  expect(edit).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.getByRole('button', { name: '活動操作' })).toHaveFocus()
})

test('ArrowRight opens a submenu with checked radio items', () => {
  const { english } = setup()
  const menu = openMenu()
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  fireEvent.keyDown(menu, { key: 'ArrowRight' })
  const zh = screen.getByRole('menuitemradio', { name: '繁體中文' })
  expect(zh).toHaveAttribute('aria-checked', 'true')
  expect(zh).toHaveFocus()
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'English' }))
  expect(english).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('menu')).toBeNull()
})

test('clicking outside closes without selecting', async () => {
  const { edit, remove } = setup()
  openMenu()
  await act(async () => { fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' })) })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(edit).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
})

test('danger items are marked for styling', () => {
  setup()
  openMenu()
  expect(screen.getByRole('menuitem', { name: '刪除活動' })).toHaveClass('menu__item--danger')
  expect(screen.getAllByRole('separator')).toHaveLength(1)
})
