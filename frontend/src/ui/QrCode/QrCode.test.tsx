import { render } from '@testing-library/react'
import { QrCode } from '..'

test('shows a sized placeholder until the image is ready', () => {
  const { container } = render(<QrCode value="https://x" alt="QR" size={120} />)
  const placeholder = container.querySelector('span')!
  expect(placeholder.className.split(' ')).toEqual(['qr', 'loading'])
  expect(placeholder).toHaveStyle({ width: '120px', height: '120px' })
})
