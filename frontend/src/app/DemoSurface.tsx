import type { ReactNode } from 'react'

// 寫死資料的示範頁共用的外框：一眼看得出這不是真的課堂資料。
export function DemoSurface({ title, children }: { title: string; children: ReactNode }) {
  return <section className="sc-demo-surface"><header className="sc-demo-banner"><strong>示範資料</strong><span>{title}</span><a href="/">回課堂首頁</a></header>{children}</section>
}
