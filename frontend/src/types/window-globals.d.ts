// Google Programmable Search 在執行期掛到 window 上的物件，只宣告 ResearchSidebar.tsx 用到的部分。
interface GoogleSearchElement {
  execute(query: string): void
}

interface Window {
  __gcse?: { parsetags: string; callback: () => void }
  google?: {
    search?: {
      cse?: {
        element?: {
          render(options: Record<string, unknown>): void
          getElement(name: string): GoogleSearchElement | undefined
        }
      }
    }
  }
}
