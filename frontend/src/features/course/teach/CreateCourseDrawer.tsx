import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '../../../contract/classroomClient'
import type { components } from '../../../contract/classroomTypes'
import { useAuth } from '../../auth/AuthContext'
import { Dialog } from '../../../components/Dialog'
import { errorMessage } from '../../../i18n/errors'
import { useT } from '../../../i18n/useT'
import { Button, Field as FormField, FieldError, FieldHint, FormError } from '../../../ui'
import { type FieldProblem, fieldProblemsFrom422 } from './fieldErrors'
import '../../../styles/teach.css'

type Field = 'name' | 'teacher_name' | 'intro' | 'goals'
const FIELDS: readonly Field[] = ['name', 'teacher_name', 'intro', 'goals']
// 上限與後端 CourseCreate 一致
const MAX: Record<Field, number> = { name: 120, teacher_name: 64, intro: 4000, goals: 4000 }

/** T1: the drawer that creates a course and opens its page. */
export function CreateCourseDrawer({ onClose }: { onClose(): void }) {
  const { t } = useT('teach')
  const { account } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<Field, string>>({ name: '', teacher_name: account?.username ?? '', intro: '', goals: '' })
  const [problems, setProblems] = useState<Partial<Record<Field, FieldProblem>>>({})
  const [failure, setFailure] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  function set(field: Field, value: string) {
    setValues(current => ({ ...current, [field]: value }))
    setProblems(current => ({ ...current, [field]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const missing: Partial<Record<Field, FieldProblem>> = {}
    if (!values.name.trim()) missing.name = { kind: 'required' }
    if (!values.teacher_name.trim()) missing.teacher_name = { kind: 'required' }
    setProblems(missing)
    setFailure(null)
    if (Object.keys(missing).length > 0) return
    setBusy(true)
    try {
      const body: components['schemas']['CourseCreate'] = values
      const created: components['schemas']['CourseTeacherView'] = await api('/courses', 'POST', body)
      // 先把 create=1 換掉，上一頁回首頁時抽屜不會再打開
      navigate('/?tab=teach', { replace: true })
      navigate('/teach/courses/' + created.id)
    } catch (error) {
      const fields = error instanceof ApiError && error.status === 422 ? fieldProblemsFrom422(error.detail, FIELDS) : {}
      if (Object.keys(fields).length > 0) setProblems(fields)
      else setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  // 送出中不能關，免得課程建好了卻沒進到課程頁
  function close() {
    if (!busy) onClose()
  }

  function message(problem: FieldProblem) {
    return problem.kind === 'tooLong' ? t('fieldErrors.tooLong', { max: problem.max }) : t(`fieldErrors.${problem.kind}`)
  }

  function field(name: Field, label: string, options: { required?: boolean; multiline?: boolean; hint?: string; placeholder?: string } = {}) {
    const problem = problems[name]
    const id = 'create-course-' + name
    const described = [options.hint ? id + '-hint' : '', problem ? id + '-error' : ''].filter(Boolean).join(' ') || undefined
    const common = {
      id, value: values[name], maxLength: MAX[name], placeholder: options.placeholder,
      'aria-invalid': problem ? true : undefined, 'aria-describedby': described,
      onChange: (event: { target: { value: string } }) => set(name, event.target.value),
    }
    return <FormField id={id} label={label} required={options.required} requiredText={t('create.required')} invalid={Boolean(problem)}>
      {options.multiline ? <textarea rows={4} {...common} /> : <input {...common} data-autofocus={name === 'name' ? true : undefined} />}
      {options.hint && <FieldHint id={id + '-hint'}>{options.hint}</FieldHint>}
      {problem && <FieldError id={id + '-error'}>{message(problem)}</FieldError>}
    </FormField>
  }

  return <Dialog
    title={t('create.title')}
    placement="right"
    closeOnBackdrop={false}
    onClose={close}
    footer={<>
      <span className="drawer-footnote">{t('create.footnote')}</span>
      <Button variant="quiet" disabled={busy} onClick={close}>{t('create.cancel')}</Button>
      <Button type="submit" form="create-course" variant="primary" disabled={busy}>{busy ? t('create.submitting') : t('create.submit')}</Button>
    </>}
  >
    <form id="create-course" className="create-course" onSubmit={event => void submit(event)} noValidate>
      <h3 className="create-course__section">{t('create.basics')}</h3>
      {field('name', t('create.name'), { required: true })}
      {field('teacher_name', t('create.teacherName'), { required: true, hint: t('create.teacherHint') })}
      <section className="create-course__background">
        <div className="create-course__background-head">
          <span className="create-course__person" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg></span>
          <div><h3>{t('create.background')}</h3><p>{t('create.backgroundHint')}</p></div>
        </div>
        {field('intro', t('create.intro'), { multiline: true, placeholder: t('create.introPlaceholder') })}
        {field('goals', t('create.goals'), { multiline: true, placeholder: t('create.goalsPlaceholder') })}
      </section>
      {failure && <FormError role="alert">{errorMessage(t, failure)}</FormError>}
    </form>
  </Dialog>
}
