import { Link } from 'react-router-dom'
import { ConstructionIllustration } from '../components/ConstructionIllustration'
import { DesktopOnlyIllustration } from '../components/DesktopOnlyIllustration'
import { useT } from '../i18n/useT'
import '../styles/placeholder-page.css'

type Props = {
  /** Already-translated heading; defaults to 「功能開發中」. */
  title?: string
  illustration?: 'construction' | 'desktopOnly'
  /** Already-translated sentence for this entry; defaults to the generic one. */
  body?: string
  /** `null`: no link out (e.g. a placeholder panel inside the editor). */
  backTo?: string | null
  backLabel?: string
  /** `panel` sits inside a page (e.g. a course tab): no <main>, dashed frame, h2. */
  variant?: 'page' | 'panel'
}

// 已有入口、但畫面還沒畫好的頁面共用這一頁（spec §4.7、畫布 S1）。畫好一頁就換掉一頁。
export function ComingSoonPage({ title, illustration = 'construction', body, backTo = '/', backLabel, variant = 'page' }: Props) {
  const { t } = useT('common')
  const Heading = variant === 'panel' ? 'h2' : 'h1'
  const inner = <>
    {illustration === 'desktopOnly' ? <DesktopOnlyIllustration /> : <ConstructionIllustration />}
    <Heading>{title ?? t('comingSoon.title')}</Heading>
    <p>{body ?? t('comingSoon.body')}</p>
    {backTo !== null && <Link className="placeholder-page__back" to={backTo}>{illustration === 'construction' && <span aria-hidden="true">←</span>}{backLabel ?? t('comingSoon.back')}</Link>}
  </>
  if (variant === 'panel') return <section className="placeholder-page placeholder-page--panel">{inner}</section>
  // S4m 是素色底、沒有虛線框
  return <main className={'placeholder-page' + (illustration === 'desktopOnly' ? ' placeholder-page--plain' : '')}>{inner}</main>
}

export function NotFoundPage() {
  const { t } = useT('common')
  return <main className="placeholder-page">
    <h1>{t('notFound.title')}</h1>
    <p>{t('notFound.body')}</p>
    <Link className="placeholder-page__back" to="/">{t('notFound.back')}</Link>
  </main>
}
