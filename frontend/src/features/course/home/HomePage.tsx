import { Navigate, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../../components/Avatar'
import { DesktopOnlyIllustration } from '../../../components/DesktopOnlyIllustration'
import type { components } from '../../../contract/classroomTypes'
import { useResource } from '../../../contract/useResource'
import { useAuth } from '../../auth/AuthContext'
import { useIsPhone } from '../../../shared/useIsPhone'
import { EmptyClassroomIllustration } from '../../../components/EmptyClassroomIllustration'
import { greetingKey } from '../../../i18n/format'
import { useT } from '../../../i18n/useT'
import { Button, ButtonLink, FormError } from '../../../ui'
import { CreateCourseDrawer } from '../teach/CreateCourseDrawer'
import { LearningCard, TeachingCard } from './CourseCards'
import { JoinCodeForm } from './JoinCodeForm'
import '../../../styles/home.css'

type Lists = components['schemas']['CourseLists']

/**
 * 帳號只有一個角色（P20、P21）：學生是 M2／M2m（「我學的課」標題列＋加入課程），老師是 H1t／H2t（教的課＋建立課程），
 * 手機老師是 S4m-t（請用電腦）。沒有分頁，網址上的 ?tab= 一律忽略；?create=1 只對老師開抽屜。
 */
export function HomePage() {
  const { account } = useAuth()
  const phone = useIsPhone()
  const teacher = account?.account_role === 'teacher'
  if (teacher && phone) return <TeacherPhoneHome />
  return teacher ? <TeacherHome /> : <StudentHome phone={phone} />
}

function Greeting() {
  const { t } = useT('home')
  const { account } = useAuth()
  return <h1 className="home__greeting">{t(`greeting.${greetingKey(new Date())}`, { name: account?.username ?? '' })}</h1>
}

function StudentHome({ phone }: { phone: boolean }) {
  const { t } = useT('home')
  const lists = useResource<Lists>('/courses')
  const data = lists.data
  const count = data?.learning.length ?? 0
  return <main className={'home' + (phone ? ' home--phone' : '')}>
    {/* 畫布 M2m：手機的掃描＋代碼列排在問候語下面；電腦版的加入課程在面板標題列右邊（Fizzy 11/16） */}
    <div className="home__head">
      <Greeting />
      {phone && <JoinCodeForm variant="phone" />}
    </div>
    <section className="home__panel" aria-labelledby="home-learning-title">
      <div className="home__bar">
        <h2 id="home-learning-title" className="home__title">
          {t('learn.title')}{count > 0 && <span className="home__count"> {t('learn.count', { count })}</span>}
        </h2>
        {!phone && <JoinCodeForm variant="inline" />}
      </div>
      {lists.loading && !data && <div aria-busy="true" className="home__loading" />}
      {!data && !lists.loading && <FormError role="alert">{t('loadFailed')}</FormError>}
      {data && (data.learning.length === 0
        ? <div className="home__empty">
          <EmptyClassroomIllustration />
          <h3>{t('empty.learnTitle')}</h3>
          <p>{t(phone ? 'empty.learnBodyPhone' : 'empty.learnBody')}</p>
          {/* 畫布 MyCoursesEmpty：也可以先到我的對話練習 */}
          <p>{t('empty.learnPractice')}</p>
          <ButtonLink variant="outline" className="home__practice" to="/my-dialogues">{t('empty.toPractice')}<span aria-hidden="true">→</span></ButtonLink>
        </div>
        : <div className="home__cards">
          {data.learning.map(course => <LearningCard key={course.id} course={course} phone={phone} />)}
        </div>)}
    </section>
  </main>
}

function TeacherHome() {
  const { t } = useT('home')
  const lists = useResource<Lists>('/courses')
  const [params, setParams] = useSearchParams()
  const creating = params.get('create') === '1'
  const data = lists.data

  function openCreate() {
    const next = new URLSearchParams(params)
    next.set('create', '1')
    setParams(next, { replace: true })
  }
  function closeCreate() {
    const next = new URLSearchParams(params)
    next.delete('create')
    setParams(next, { replace: true })
  }

  const empty = data !== null && data.teaching.length === 0
  return <main className="home">
    <Greeting />
    <section className="home__panel" aria-labelledby="home-teaching-title">
      <div className="home__bar">
        <h2 id="home-teaching-title" className="home__title">
          {t('teach.title')}{data && data.teaching.length > 0 && <span className="home__count"> {t('teach.count', { count: data.teaching.length })}</span>}
        </h2>
        {!empty && <Button variant="primary" onClick={openCreate}><span aria-hidden="true">+</span>{t('create')}</Button>}
      </div>
      {lists.loading && !data && <div aria-busy="true" className="home__loading" />}
      {!data && !lists.loading && <FormError role="alert">{t('loadFailed')}</FormError>}
      {data && (empty
        ? <div className="home__empty home__empty--teach">
          <EmptyClassroomIllustration />
          <h3>{t('empty.teachTitle')}</h3>
          <p>{t('empty.teachBody')}</p>
          <Button variant="primary" className="home__create-first" onClick={openCreate}><span aria-hidden="true">+</span>{t('empty.teachCreate')}</Button>
          <ol className="home__steps" aria-label={t('empty.stepsLabel')}>
            {(['create', 'invite', 'activity'] as const).map((step, index) => <li key={step}>
              <span className="home__step-number" aria-hidden="true">{index + 1}</span>
              <span><b>{t(`empty.steps.${step}.title`)}</b>{t(`empty.steps.${step}.body`)}</span>
            </li>)}
          </ol>
        </div>
        : <div className="home__cards">
          {data.teaching.map(course => <TeachingCard key={course.id} course={course} phone={false} />)}
        </div>)}
    </section>
    {creating && <CreateCourseDrawer onClose={closeCreate} />}
  </main>
}

/** S4m-t：老師帳號在手機上只有這一頁；頂部列與頭像選單照舊（可以登出）。手機帶 ?create=1 照舊轉 S4m。 */
function TeacherPhoneHome() {
  const { t } = useT('home')
  const { account } = useAuth()
  const [params] = useSearchParams()
  if (params.get('create') === '1') return <Navigate to="/teach/create-course" replace />
  const name = account?.username ?? ''
  return <main className="home home--phone home--teacher-phone">
    <DesktopOnlyIllustration />
    <h1>{t('teacherPhone.title')}</h1>
    <p>{t('teacherPhone.body')}</p>
    <p className="home__signed-in">
      <Avatar name={name} />
      <span>{t('teacherPhone.signedIn', { name })}</span>
      <span className="home__role-tag">{t('teacherPhone.role')}</span>
    </p>
  </main>
}
