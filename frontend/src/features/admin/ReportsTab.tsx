import { useEffect, useState } from 'react'
import { getEvalReport, getInteractionLog, getVoiceReport, interactionLogFile, type EvalReportView, type InteractionLogView, type VoiceReportView } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button, Chip, ChipGroup, CopyButton, FormError } from '../../ui'
import styles from './Admin.module.css'
import { adminTime } from './adminTime'

type OnError = (failure: unknown) => void

const RANGES = [1, 7, 30] as const
type Range = (typeof RANGES)[number]
const MEASURES = ['schema', 'flags', 'move', 'check', 'language', 'citations'] as const

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

function cost(value: number | null): string {
  return value === null ? '—' : value.toFixed(4)
}

/** 後台「報表」：QA 照題單在網站上作答後的評測，與語音用量；兩張表都從後台紀錄算。 */
export function ReportsTab({ onError }: { onError: OnError }) {
  const { t } = useT('admin')
  const [days, setDays] = useState<Range>(7)
  const [evals, setEvals] = useState<EvalReportView | null>(null)
  const [voice, setVoice] = useState<VoiceReportView | null>(null)
  const [log, setLog] = useState<InteractionLogView | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setFailed(false)
    void Promise.all([getEvalReport(days), getVoiceReport(days), getInteractionLog(days)])
      .then(([e, v, l]) => { if (live) { setEvals(e); setVoice(v); setLog(l) } })
      .catch((failure: unknown) => { if (live) { setFailed(true); onError(failure) } })
    return () => { live = false }
  }, [days, onError])

  return <>
    <ChipGroup label={t('reports.range')}>
      {RANGES.map(range => <Chip key={range} pressed={days === range} onClick={() => setDays(range)}>{t(`reports.days.${range}`)}</Chip>)}
    </ChipGroup>
    <p className={styles.hint}>{t('reports.lead')}</p>
    {failed && <FormError role="alert">{t('reports.loadFailed')}</FormError>}
    {evals && <EvalSection report={evals} />}
    {voice && <VoiceSection report={voice} />}
    {log && <LogSection log={log} days={days} />}
  </>
}

function EvalSection({ report }: { report: EvalReportView }) {
  const { t } = useT('admin')
  return <section className={`${styles.card} ${styles.panel}`} aria-label={t('reports.eval.title')}>
    <div>
      <h2 className={styles.panelTitle}>{t('reports.eval.title')}</h2>
      <p className={styles.panelLead}>{t('reports.eval.lead')}</p>
    </div>
    <div className={styles.scenario}>
      <p>{report.scenario}</p>
      <CopyButton text={report.scenario} label={t('reports.eval.copyScenario')} variant="outline" />
    </div>
    <table className={styles.table} aria-label={t('reports.eval.totals')}>
      <thead><tr><th>{t('reports.eval.measure')}</th><th className={styles.num}>{t('reports.eval.result')}</th><th className={styles.num}>{t('reports.eval.counted')}</th></tr></thead>
      <tbody>
        {MEASURES.map(key => {
          const total = report.totals.find(item => item.key === key)
          return <tr key={key}>
            <td>{t(`reports.eval.measures.${key}`)}</td>
            <td className={styles.num}>{percent(total?.rate ?? null)}</td>
            <td className={styles.num}>{total?.count ?? 0}</td>
          </tr>
        })}
        <tr><td>{t('reports.eval.leaked')}</td><td className={styles.num}>{report.leaked}</td><td className={styles.num}>{report.runs}</td></tr>
      </tbody>
    </table>
    <table className={styles.table} aria-label={t('reports.eval.cases')}>
      <thead><tr>
        <th>{t('reports.eval.case')}</th>
        <th>{t('reports.eval.typed')}</th>
        <th>{t('reports.eval.locale')}</th>
        <th className={styles.num}>{t('reports.eval.runs')}</th>
        <th className={styles.num}>{t('reports.eval.measures.move')}</th>
        <th className={styles.num}>{t('reports.eval.measures.flags')}</th>
        <th className={styles.num}>{t('reports.eval.measures.check')}</th>
        <th className={styles.num}>{t('reports.eval.measures.language')}</th>
      </tr></thead>
      <tbody>
        {report.cases.map(item => <tr key={item.id}>
          <td><span className={styles.mono}>{item.id}</span><span className={styles.meta}>{item.category}</span></td>
          <td>
            <ol className={styles.typed}>{item.messages.map((text, index) => <li key={index}>{text}</li>)}</ol>
            {item.notes.map(note => <p key={note} className={styles.fieldError}>{note}</p>)}
            {item.leaked > 0 && <p className={styles.fieldError}>{t('reports.eval.leakedRuns', { count: item.leaked })}</p>}
          </td>
          <td className={styles.mono}>{item.locale}</td>
          <td className={styles.num}>{item.runs}</td>
          <td className={styles.num}>{percent(item.move)}</td>
          <td className={styles.num}>{percent(item.flags)}</td>
          <td className={styles.num}>{percent(item.check)}</td>
          <td className={styles.num}>{percent(item.language)}</td>
        </tr>)}
      </tbody>
    </table>
  </section>
}

function VoiceSection({ report }: { report: VoiceReportView }) {
  const { t, locale } = useT('admin')
  return <section className={`${styles.card} ${styles.panel}`} aria-label={t('reports.voice.title')}>
    <div>
      <h2 className={styles.panelTitle}>{t('reports.voice.title')}</h2>
      <p className={styles.panelLead}>{t('reports.voice.lead')}</p>
    </div>
    {!report.costed && <p className={styles.warning}>{t('reports.voice.noRates')}</p>}
    <dl className={styles.facts}>
      <div><dt>{t('reports.voice.sessions')}</dt><dd className={styles.factStrong}>{report.totals.sessions}</dd></div>
      <div><dt>{t('reports.voice.tokens')}</dt><dd>{t('reports.voice.inOut', { input: report.totals.input_tokens, output: report.totals.output_tokens })}</dd></div>
      <div><dt>{t('reports.voice.cost')}</dt><dd>{cost(report.totals.cost)}</dd></div>
    </dl>
    {report.sessions.length === 0
      ? <p className={styles.hint}>{t('reports.voice.empty')}</p>
      : <table className={styles.table} aria-label={t('reports.voice.list')}>
        <thead><tr>
          <th>{t('reports.voice.time')}</th>
          <th>{t('reports.voice.account')}</th>
          <th>{t('reports.voice.kind')}</th>
          <th>{t('reports.voice.model')}</th>
          <th className={styles.num}>{t('reports.voice.input')}</th>
          <th className={styles.num}>{t('reports.voice.output')}</th>
          <th className={styles.num}>{t('reports.voice.cost')}</th>
        </tr></thead>
        <tbody>
          {report.sessions.map((session, index) => <tr key={index}>
            <td>{adminTime(locale, session.at)}</td>
            <td>{session.username ?? '—'}</td>
            <td>{t(session.endpoint === 'solo.voice' ? 'reports.voice.live' : 'reports.voice.judge')}</td>
            <td className={styles.mono}>{session.model ?? '—'}</td>
            <td className={styles.num}>{t('reports.voice.withAudio', { total: session.input_tokens, audio: session.audio_input_tokens })}</td>
            <td className={styles.num}>{t('reports.voice.withAudio', { total: session.output_tokens, audio: session.audio_output_tokens })}</td>
            <td className={styles.num}>{cost(session.cost)}</td>
          </tr>)}
        </tbody>
      </table>}
  </section>
}

function LogSection({ log, days }: { log: InteractionLogView; days: number }) {
  const { t, locale } = useT('admin')
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  async function save() {
    setSaving(true)
    setSaveFailed(false)
    try {
      const url = URL.createObjectURL(await interactionLogFile(days))
      const link = document.createElement('a')
      link.href = url
      link.download = `interaction-log-${days}d.jsonl`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return <section className={`${styles.card} ${styles.panel}`} aria-label={t('reports.log.title')}>
    <div className={styles.panelHead}>
      <div>
        <h2 className={styles.panelTitle}>{t('reports.log.title')}</h2>
        <p className={styles.panelLead}>{t('reports.log.lead')}</p>
      </div>
      <Button variant="outline" onClick={() => { void save() }} disabled={saving}>{t('reports.log.download')}</Button>
    </div>
    {saveFailed && <FormError role="alert">{t('reports.log.downloadFailed')}</FormError>}
    {!log.enabled && <p className={styles.warning}>{t('reports.log.off')}</p>}
    <dl className={styles.facts}>
      <div><dt>{t('reports.log.total')}</dt><dd className={styles.factStrong}>{log.total}</dd></div>
      <div><dt>{t('reports.log.subjects')}</dt><dd>{log.subjects}</dd></div>
    </dl>
    {log.counts.length === 0
      ? <p className={styles.hint}>{t('reports.log.empty')}</p>
      : <table className={styles.table} aria-label={t('reports.log.list')}>
        <thead><tr>
          <th>{t('reports.log.kind')}</th>
          <th>{t('reports.log.name')}</th>
          <th className={styles.num}>{t('reports.log.count')}</th>
          <th>{t('reports.log.last')}</th>
        </tr></thead>
        <tbody>
          {log.counts.map(row => <tr key={`${row.kind} ${row.name}`}>
            <td>{t(row.kind === 'model' ? 'reports.log.model' : 'reports.log.request')}</td>
            <td className={styles.mono}>{row.name}</td>
            <td className={styles.num}>{row.count}</td>
            <td>{adminTime(locale, row.last_at)}</td>
          </tr>)}
        </tbody>
      </table>}
  </section>
}
