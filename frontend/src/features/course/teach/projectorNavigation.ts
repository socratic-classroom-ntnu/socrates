import type { MouseEvent } from 'react'

export const PROJECTOR_WINDOW_NAME = 'socrates-projector'

export function openProjectorLink(event: MouseEvent<HTMLAnchorElement>, to: string) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  window.open(to, PROJECTOR_WINDOW_NAME)
}
