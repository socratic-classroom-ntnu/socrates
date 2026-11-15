import { useState } from 'react'
import { Dialog } from '../../../components/Dialog'
import { useT } from '../../../i18n/useT'
import { Button } from '../../../ui'
import type { Topic } from './MyDialoguesPage'
import styles from './MyDialogues.module.css'

/**
 * 學生版挑題視窗（spec §10 M18；Figma M3／M3m）：電腦是 820 寬、左清單右預覽，
 * 手機是一次展開一題的清單。選好就直接開始，不能改題目。
 */
export function TopicPicker({ topics, remaining, phone, busy, onStart, onClose }: {
  topics: Topic[]; remaining: number; phone: boolean; busy: boolean; onStart(topic: Topic): void; onClose(): void
}) {
  const { t } = useT('practice')
  const [selected, setSelected] = useState<string | null>(phone ? null : topics[0]?.id ?? null)
  const current = topics.find(topic => topic.id === selected) ?? null
  const canStart = remaining > 0 && !busy

  if (phone) {
    return <Dialog title={t('pickerTitle')} description={t('pickerSub', { count: remaining })} onClose={onClose}>
      <ul className={styles.accordion}>
        {topics.map(topic => {
          const open = topic.id === selected
          return <li key={topic.id}>
            <button type="button" className={styles.accordionHead} aria-expanded={open} onClick={() => setSelected(open ? null : topic.id)}>
              <b>{topic.title}</b>
              <span className={`${styles.categoryPill} ${styles[`pill-${topic.category}`]}`}>{t(`category.${topic.category}`)}</span>
            </button>
            {open && <div className={styles.accordionBody}>
              <p>{topic.body}</p>
              <Button variant="primary" disabled={!canStart} onClick={() => onStart(topic)}>{t('startDialogue')}<span aria-hidden="true">→</span></Button>
            </div>}
          </li>
        })}
      </ul>
    </Dialog>
  }

  return <Dialog
    size="wide"
    title={t('pickerTitle')}
    description={t('pickerSub', { count: remaining })}
    onClose={onClose}
    footer={<>
      <Button variant="quiet" onClick={onClose}>{t('cancel')}</Button>
      <Button variant="primary" disabled={!canStart || current === null} onClick={() => current && onStart(current)}>{t('startDialogue')}</Button>
    </>}
  >
    <div className={styles.picker}>
      <ul role="listbox" aria-label={t('topics')} className={styles.pickerList}>
        {topics.map(topic => <li
          key={topic.id}
          role="option"
          aria-selected={topic.id === selected}
          tabIndex={0}
          className={styles.pickerOption}
          onClick={() => setSelected(topic.id)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(topic.id) } }}
        >
          <b>{topic.title}</b>
          <span className={styles.optionCategory}>{t(`category.${topic.category}`)}</span>
        </li>)}
      </ul>
      {current && <div className={styles.preview}>
        <span className={`${styles.categoryPill} ${styles[`pill-${current.category}`]}`}>{t(`category.${current.category}`)}</span>
        <h3>{current.title}</h3>
        <p className={styles.previewBody}>{current.body}</p>
        <p className={styles.previewHint}>{t('pickerHint')}</p>
      </div>}
    </div>
  </Dialog>
}
