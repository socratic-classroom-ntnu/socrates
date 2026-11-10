/** 串起元件與頁面的 class，略過 false、undefined、空字串 */
export function classNames(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ')
}
