import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useT } from '../../../i18n/useT'
import { type ActivityForm, addQuestion, LIMITS, moveQuestion, type QuestionForm } from './editorState'

type Props = {
  form: ActivityForm
  selected: string
  counts: Record<string, number>
  locked: boolean
  onSelect(id: string): void
  onChange(form: ActivityForm, select?: string): void
}

/** 題目順序 tab: drag (mouse or keyboard) to reorder, select to edit, add a blank question. */
export function QuestionOrderPanel({ form, selected, counts, locked, onSelect, onChange }: Props) {
  const { t } = useT('editor')
  // Web2.0 的拖拉規範：直向限制＋限制在最近的捲動容器，避免撐開版面
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = form.questions.findIndex(q => q.id === active.id)
    const to = form.questions.findIndex(q => q.id === over.id)
    onChange(moveQuestion(form, from, to))
  }

  function add() {
    const next = addQuestion(form)
    if (next !== form) onChange(next, next.questions[next.questions.length - 1].id)
  }

  return <div className="order-panel">
    <div className="order-panel__bar">
      <span>{t('panel.count', { count: form.questions.length })}</span>
      {locked
        ? <span className="locked-badge">{t('locked.badge')}</span>
        : <button type="button" className="button button--outline order-panel__add" disabled={form.questions.length >= LIMITS.questions} onClick={add}>{t('panel.add')}</button>}
    </div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]} onDragEnd={onDragEnd}>
      <SortableContext items={form.questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
        <ol className="order-panel__list">
          {form.questions.map((q, index) => <OrderItem key={q.id} question={q} index={index} selected={q.id === selected} count={counts[q.id] ?? 0} locked={locked} onSelect={onSelect} />)}
        </ol>
      </SortableContext>
    </DndContext>
    <p className="order-panel__hint">{locked ? t('panel.lockedHint') : t('panel.orderHint')}</p>
  </div>
}

function OrderItem({ question, index, selected, count, locked, onSelect }: { question: QuestionForm; index: number; selected: boolean; count: number; locked: boolean; onSelect(id: string): void }) {
  const { t } = useT('editor')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id, disabled: locked })
  const title = question.title.trim() || t('panel.untitled')
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    className={'order-item' + (selected ? ' order-item--selected' : '') + (count ? ' order-item--error' : '')}>
    {!locked && <span className="order-item__handle" {...attributes} {...listeners} aria-label={t('panel.drag', { title })}>⋮⋮</span>}
    <button type="button" className="order-item__select" aria-current={selected ? 'true' : undefined} onClick={() => onSelect(question.id)}>
      <span className="order-item__number">{index + 1}</span>
      <span className="order-item__title">{title}</span>
      {count > 0 && <span className="order-item__count" aria-label={t('panel.problems', { count })}>{count}</span>}
    </button>
  </li>
}
