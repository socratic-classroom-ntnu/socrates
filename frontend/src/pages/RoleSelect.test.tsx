import { render, screen } from '@testing-library/react'
import { RoleSelect } from './RoleSelect'
import { rememberRole, roleFromPath, storedRole } from '../entryRole'

test('role choice offers a student door and a teacher door', () => {
  render(<RoleSelect />)
  expect(screen.getByRole('link', { name: /我是學生/ })).toHaveAttribute('href', '/student')
  expect(screen.getByRole('link', { name: /我是老師/ })).toHaveAttribute('href', '/teacher')
})

test('only /student and /teacher count as entrances', () => {
  expect(roleFromPath('/student')).toBe('student')
  expect(roleFromPath('/teacher/')).toBe('teacher')
  expect(roleFromPath('/')).toBeNull()
  expect(roleFromPath('/classrooms/abc')).toBeNull()
  expect(roleFromPath('/teacher/extra')).toBeNull()
})

test('the chosen entrance is remembered, and junk values are ignored', () => {
  expect(storedRole()).toBeNull()
  rememberRole('teacher')
  expect(storedRole()).toBe('teacher')
  localStorage.setItem('socrates.entryRole', 'admin')
  expect(storedRole()).toBeNull()
  rememberRole(null)
  expect(storedRole()).toBeNull()
})
