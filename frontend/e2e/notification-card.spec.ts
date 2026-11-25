import { expect, test, type Page } from '@playwright/test'
import type { Notification } from '../src/contract/notificationClient'
import { classroomRoutes } from './fixtures/api'

const announcement: Notification = {
  id: 'announcement:1', type: 'announcement', title: '維護公告', content: '公告完整內容',
  time: 200, read: false, pop_up: false, maintenance: null,
}

async function openNotifications(page: Page, role: 'student' | 'teacher') {
  const origin = new URL(test.info().project.use.baseURL!).origin
  const routes = classroomRoutes({ signedIn: true, role })
  const readRequests: Array<{ id: string }> = []
  routes['GET /notifications'] = [announcement, { ...announcement, id: 'announcement:2', title: '已讀公告', read: true }]
  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== origin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const key = `${request.method()} ${url.pathname.replace(/^\/api\/v2/, '')}${url.search}`
    if (key === 'POST /notifications/read') {
      readRequests.push(request.postDataJSON())
      return route.fulfill({ status: 204 })
    }
    if (Object.hasOwn(routes, key)) return route.fulfill({ json: routes[key] })
    return route.fulfill({ status: 404, json: { detail: 'Missing test fixture' } })
  })
  await page.goto('/notifications')
  return readRequests
}

test('desktop card hover and keyboard focus are visible without shifting the list', async ({ page }) => {
  await openNotifications(page, 'teacher')
  const card = page.getByRole('button', { name: '查看完整內容：維護公告' })
  const nextCard = page.getByRole('button', { name: '查看完整內容：已讀公告' })
  await expect(card).toBeVisible()
  const bounds = await card.boundingBox()
  const nextBounds = await nextCard.boundingBox()
  const background = await card.evaluate(element => getComputedStyle(element).backgroundColor)
  const border = await card.evaluate(element => getComputedStyle(element).borderTopColor)
  await card.hover()
  await expect(card).toHaveCSS('cursor', 'pointer')
  await expect(card).not.toHaveCSS('background-color', background)
  await expect(card).not.toHaveCSS('border-top-color', border)
  expect(await card.boundingBox()).toEqual(bounds)
  expect(await nextCard.boundingBox()).toEqual(nextBounds)

  await card.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(card).toBeFocused()
  await expect(card).toHaveCSS('outline-style', 'solid')
  await expect(card).toHaveCSS('outline-width', '2px')
  await expect(card).toHaveCSS('outline-offset', '2px')
  await expect(card).toHaveCSS('transition-property', 'background-color, border-color')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(card).toHaveCSS('transition-property', 'none')
})

test('card padding opens the announcement once on desktop and phone', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 844 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const readRequests = await openNotifications(page, 'student')
    const card = page.getByRole('button', { name: '查看完整內容：維護公告' })
    // 左上內距沒有文字或圖示。
    await card.click({ position: { x: 5, y: 5 } })
    const dialog = page.getByRole('dialog', { name: '維護公告' })
    await expect(dialog.getByText('公告完整內容', { exact: true })).toBeVisible()
    await expect(card).toHaveAttribute('data-read', 'true')
    await dialog.getByRole('button', { name: '我知道了' }).click()
    await expect(dialog).toBeHidden()
    expect(readRequests).toEqual([{ id: announcement.id }])
    await page.unrouteAll()
  }
})
