import { Link } from 'react-router-dom'
import { useT } from '../i18n/useT'
import '../styles/placeholder-page.css'

// 已有入口、但畫面還沒畫好的頁面共用這一頁（spec §4.7）。畫好一頁就換掉一頁。
export function ComingSoonPage() {
  const { t } = useT('common')
  return <main className="placeholder-page">
    <svg className="placeholder-page__icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18" /><path d="M5 20l3-9h8l3 9" /><path d="M9.5 11l.8-3h3.4l.8 3" /><path d="M7 16h10" />
    </svg>
    <h1>{t('comingSoon.title')}</h1>
    <p>{t('comingSoon.body')}</p>
    <Link to="/">{t('comingSoon.back')}</Link>
  </main>
}

export function NotFoundPage() {
  const { t } = useT('common')
  return <main className="placeholder-page">
    <h1>{t('notFound.title')}</h1>
    <p>{t('notFound.body')}</p>
    <Link to="/">{t('notFound.back')}</Link>
  </main>
}
