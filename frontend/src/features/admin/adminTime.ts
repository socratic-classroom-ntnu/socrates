/** 後台的「M/D HH:mm」（Figma AD3b、AD9）。 */
export function adminTime(locale: string, seconds: number): string {
  return new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(seconds * 1000))
}
