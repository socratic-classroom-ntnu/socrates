import { joinPathFor, parseScannedQr } from './parseScannedQr'

const HERE = 'https://socrates.example.org/scan'

test.each([
  ['https://socrates.example.org/join?code=KNB6ZE33', { kind: 'course', code: 'KNB6ZE33' }],
  ['https://socrates.example.org/activities/a-123/join', { kind: 'activity', id: 'a-123' }],
])('reads this site\'s QR: %s', (text, expected) => {
  expect(parseScannedQr(text, HERE)).toEqual(expected)
})

test('http and https count as the same site', () => {
  expect(parseScannedQr('http://socrates.example.org/join?code=KNB6ZE33', HERE)).toEqual({ kind: 'course', code: 'KNB6ZE33' })
  expect(parseScannedQr('https://localhost:5173/activities/a1/join', 'http://localhost:5173/scan')).toEqual({ kind: 'activity', id: 'a1' })
})

test('a trailing slash is fine', () => {
  expect(parseScannedQr('https://socrates.example.org/join/?code=KNB6ZE33', HERE)).toEqual({ kind: 'course', code: 'KNB6ZE33' })
  expect(parseScannedQr('https://socrates.example.org/activities/a1/join/', HERE)).toEqual({ kind: 'activity', id: 'a1' })
})

test('the code is cleaned up the same way as the home page code field', () => {
  expect(parseScannedQr('https://socrates.example.org/join?code=%20knb6%20ze33%20', HERE)).toEqual({ kind: 'course', code: 'KNB6ZE33' })
  expect(parseScannedQr('https://socrates.example.org/join?code=knb6ze33', HERE)).toEqual({ kind: 'course', code: 'KNB6ZE33' })
})

test('other parameters on the QR are ignored', () => {
  expect(parseScannedQr('https://socrates.example.org/join?utm=x&code=AB12&next=https://evil.example', HERE)).toEqual({ kind: 'course', code: 'AB12' })
})

test.each([
  ['another site', 'https://evil.example/join?code=KNB6ZE33'],
  ['a subdomain of this site', 'https://qa.socrates.example.org/join?code=KNB6ZE33'],
  ['another port', 'https://socrates.example.org:8443/join?code=KNB6ZE33'],
  ['no host', '/join?code=KNB6ZE33'],
  ['no scheme', 'socrates.example.org/join?code=KNB6ZE33'],
  ['another scheme', 'ftp://socrates.example.org/join?code=KNB6ZE33'],
  ['join without a code', 'https://socrates.example.org/join'],
  ['join with an empty code', 'https://socrates.example.org/join?code=%20%20'],
  ['another page of this site', 'https://socrates.example.org/learn/courses/c1'],
  ['an activity without an id', 'https://socrates.example.org/activities//join'],
  ['a longer activity path', 'https://socrates.example.org/activities/a1/join/extra'],
  ['plain text', 'KNB6ZE33'],
  ['an empty string', ''],
  ['a scheme with nothing after it', 'http://'],
  ['a broken escape in the activity id', 'https://socrates.example.org/activities/%E0/join'],
  ['a broken URL', 'https://socrates.example.org:99999/join?code=A'],
])('anything else is not recognised: %s', (_, text) => {
  expect(parseScannedQr(text, HERE)).toEqual({ kind: 'unknown' })
})

test('never throws, whatever it is given', () => {
  for (const text of ['http://', 'https://[', '%', 'https://socrates.example.org/activities/%/join', '\u0000', 'https://socrates.example.org/join?code=%E0']) {
    expect(() => parseScannedQr(text, HERE)).not.toThrow()
  }
  expect(() => parseScannedQr('https://socrates.example.org/join?code=A', 'not a url')).not.toThrow()
  expect(parseScannedQr('https://socrates.example.org/join?code=A', 'not a url')).toEqual({ kind: 'unknown' })
})

test('the join path is rebuilt from the parsed value only', () => {
  expect(joinPathFor({ kind: 'course', code: 'KNB6ZE33' })).toBe('/join?code=KNB6ZE33')
  expect(joinPathFor({ kind: 'activity', id: 'a 1/x' })).toBe('/activities/a%201%2Fx/join')
})
