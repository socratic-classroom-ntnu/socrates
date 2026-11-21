// Text a reader actually gets: aria-hidden decorations (the 「問」 seal, icons) are left out.
export function readableText(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove())
  return copy.textContent ?? ''
}
