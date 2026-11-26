import { useState } from 'react'
import { Dialog } from '../../../components/Dialog'
import { formatDateTime } from '../../../i18n/format'
import { useT } from '../../../i18n/useT'
import { Button, ButtonLink } from '../../../ui'
import type { Dialogue, Topic } from './MyDialoguesPage'
import styles from './MyDialogues.module.css'

/** Each topic's most recent dialogue, so the picker can offer it back instead of only a new one. */
function latestByTopic(dialogues: Dialogue[]): Map<string, Dialogue> {
  const latest = new Map<string, Dialogue>()
  for (const dialogue of dialogues) {
    const seen = latest.get(dialogue.topic_id)
    if (!seen || dialogue.created_at > seen.created_at) latest.set(dialogue.topic_id, dialogue)
  }
  return latest
}

/**
 * 學生版挑題視窗（spec §10 M18；Figma M3／M3m）：電腦是 820 寬、左清單右預覽，
 * 手機是一次展開一題的清單。選好就直接開始，不能改題目。
 * 聊過的題目標出「已完成／對話中」，先給「看回顧／繼續對話」，再開新的一段放在旁邊（使用者回饋 fb008）。
 */
export function TopicPicker({ topics, dialogues = [], remaining, phone, busy, onStart, onClose }: {
  topics: Topic[]; dialogues?: Dialogue[]; remaining: number; phone: boolean; busy: boolean; onStart(topic: Topic): void; onClose(): void
}) {
  const { t, locale } = useT('practice')
  const [selected, setSelected] = useState<string | null>(phone ? null : topics[0]?.id ?? null)
  const current = topics.find(topic => topic.id === selected) ?? null
  const canStart = remaining > 0 && !busy
  const latest = latestByTopic(dialogues)
  const past = current ? latest.get(current.id) : undefined

  const statusOf = (dialogue: Dialogue) => dialogue.status === 'completed'
    ? <span className={styles.pillDone}>{t('completed')}</span>
    : <span className={styles.pillOpen}>{t('inProgress')}</span>
  const pastLink = (dialogue: Dialogue) => <ButtonLink variant="primary" to={`/learn/activities/${dialogue.activity_id}/dialogue`}>
    {t(dialogue.status === 'completed' ? 'review' : 'resume')}<span aria-hidden="true">→</span>
  </ButtonLink>
  const pastNote = (dialogue: Dialogue) => <p className={styles.pastNote}>
    {statusOf(dialogue)}{t('pastDialogue', { at: formatDateTime(dialogue.created_at, locale, 'yearWeekdayDateTime') })}
  </p>

  if (phone) {
    return <Dialog title={t('pickerTitle')} description={t('pickerSub', { count: remaining })} onClose={onClose}>
      <ul className={styles.accordion}>
        {topics.map(topic => {
          const open = topic.id === selected
          const before = latest.get(topic.id)
          return <li key={topic.id}>
            <button type="button" className={styles.accordionHead} aria-expanded={open} onClick={() => setSelected(open ? null : topic.id)}>
              <b>{topic.title}</b>
              <span className={styles.headEnd}>
                {before && statusOf(before)}
                <span className={`${styles.categoryPill} ${styles[`pill-${topic.category}`]}`}>{t(`category.${topic.category}`)}</span>
              </span>
            </button>
            {open && <div className={styles.accordionBody}>
              <p>{topic.body}</p>
              {before && pastNote(before)}
              {before && pastLink(before)}
              <Button variant={before ? 'outline' : 'primary'} disabled={!canStart} onClick={() => onStart(topic)}>
                {t(before ? 'startAgain' : 'startDialogue')}{!before && <span aria-hidden="true">→</span>}
              </Button>
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
      {past
        ? <>
          <Button variant="outline" disabled={!canStart} onClick={() => current && onStart(current)}>{t('startAgain')}</Button>
          {pastLink(past)}
        </>
        : <Button variant="primary" disabled={!canStart || current === null} onClick={() => current && onStart(current)}>{t('startDialogue')}</Button>}
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
          <span className={styles.optionMeta}>
            <span className={styles.optionCategory}>{t(`category.${topic.category}`)}</span>
            {latest.has(topic.id) && statusOf(latest.get(topic.id) as Dialogue)}
          </span>
        </li>)}
      </ul>
      {current && <div className={styles.preview}>
        <span className={`${styles.categoryPill} ${styles[`pill-${current.category}`]}`}>{t(`category.${current.category}`)}</span>
        <h3>{current.title}</h3>
        <p className={styles.previewBody}>{current.body}</p>
        {past && pastNote(past)}
        <p className={styles.previewHint}>{t('pickerHint')}</p>
      </div>}
    </div>
  </Dialog>
}
