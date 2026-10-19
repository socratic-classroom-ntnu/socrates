import { Link, Navigate, useSearchParams } from 'react-router-dom'
import type { components } from '../../api/classroomTypes'
import { useResource } from '../../api/useResource'
import { useAuth } from '../../app/AuthContext'
import { useIsPhone } from '../../app/useIsPhone'
import { EmptyClassroomIllustration } from '../../components/EmptyClassroomIllustration'
import { greetingKey } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { CreateCourseDrawer } from '../teach/CreateCourseDrawer'
import { LearningCard, TeachingCard } from './CourseCards'
import { JoinCodeForm } from './JoinCodeForm'
import '../../styles/home.css'

type Lists = components['schemas']['CourseLists']
type Tab = 'learn' | 'teach'

/** H1／H1m (and H2／H2m when a tab is empty): one layout with or without courses. */
export function HomePage() {
  const { t } = useT('home')
  const { account } = useAuth()
  const phone = useIsPhone()
  const lists = useResource<Lists>('/courses')
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')

  const data = lists.data
  const tab: Tab = requested === 'learn' || requested === 'teach'
    ? requested
    : data && data.learning.length === 0 && data.teaching.length > 0 ? 'teach' : 'learn'
  const creating = params.get('create') === '1'

  function choose(next: Tab) { setParams({ tab: next }, { replace: true }) }
  function openCreate() { setParams({ tab: 'teach', create: '1' }, { replace: true }) }
  function closeCreate() { setParams({ tab }, { replace: true }) }

  // 老師端沒有手機版：手機帶著 create=1 進來就換成 S4m
  if (phone && creating) return <Navigate to="/teach/create-course" replace />

  const createButton = <button type="button" className="button button--primary" onClick={openCreate}><span aria-hidden="true">+</span>{t('create')}</button>

  return <main className={'home' + (phone ? ' home--phone' : '')}>
    <h1 className="home__greeting">{t(`greeting.${greetingKey(new Date())}`, { name: account?.username ?? '' })}</h1>
    <section className="home__panel">
      <div className="home__bar">
        <div role="tablist" aria-label={t('tabs.label')} className="home__tabs">
          {(['learn', 'teach'] as const).map(key => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => choose(key)}>{t(`tabs.${key}`)}</button>)}
        </div>
        {!phone && (tab === 'learn' ? <JoinCodeForm variant="inline" /> : createButton)}
      </div>
      {phone && (tab === 'learn'
        ? <JoinCodeForm variant="phone" />
        : <Link className="button button--primary home__create-phone" to="/teach/create-course"><span aria-hidden="true">+</span>{t('create')}</Link>)}
      {lists.loading && !data && <div aria-busy="true" className="home__loading" />}
      {!data && !lists.loading && <p role="alert" className="form-error">{t('loadFailed')}</p>}
      {data && <TabContent tab={tab} lists={data} phone={phone} />}
    </section>
    {creating && <CreateCourseDrawer onClose={closeCreate} />}
  </main>
}

function TabContent({ tab, lists, phone }: { tab: Tab; lists: Lists; phone: boolean }) {
  const { t } = useT('home')
  const courses = tab === 'learn' ? lists.learning : lists.teaching
  if (courses.length === 0) return <div className="home__empty">
    <EmptyClassroomIllustration />
    <h2>{t(tab === 'learn' ? 'empty.learnTitle' : 'empty.teachTitle')}</h2>
    <p>{t(tab === 'learn' ? 'empty.learnBody' : 'empty.teachBody')}</p>
  </div>
  return <>
    {tab === 'teach' && phone && <p className="home__hint">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
      {t('phoneHint')}
    </p>}
    <div className="home__cards">
      {tab === 'learn'
        ? lists.learning.map(course => <LearningCard key={course.id} course={course} phone={phone} />)
        : lists.teaching.map(course => <TeachingCard key={course.id} course={course} phone={phone} />)}
    </div>
  </>
}
