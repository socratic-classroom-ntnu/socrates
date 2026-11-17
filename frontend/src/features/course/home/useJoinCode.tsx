import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../contract/classroomClient'
import type { components } from '../../../contract/classroomTypes'
import { errorCode, errorMessage } from '../../../i18n/errors'
import { useT } from '../../../i18n/useT'

type Preview = components['schemas']['JoinPreview']

/** 課程代碼的整理方式：去掉所有空白、轉大寫。首頁代碼欄、掃描頁的輸入與掃到的 QR 都用這一個。 */
export function normalizeCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/**
 * 用課程代碼查課程：查得到就去 J1（帶著預覽，J1 不用再查一次），已加入的直接進課程頁；查不到就把錯誤留給畫面顯示。
 * 首頁代碼欄與掃描頁的「改用輸入代碼」共用；掃描頁離開時要 `replace`，上一頁才不會回到掃描頁。
 * 查詢還沒回來就離開了（例如在掃描頁按關閉），回來的結果就丟掉：navigate 在卸載後照樣會換頁，學生會被拉回加入頁。
 */
export function useJoinCode({ replace = false }: { replace?: boolean } = {}) {
  const navigate = useNavigate()
  const [failure, setFailure] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function lookUp(value: string) {
    const code = normalizeCode(value)
    if (!code || busy) return
    setBusy(true)
    setFailure(null)
    try {
      const preview: Preview = await api('/course-join/preview?code=' + encodeURIComponent(code))
      if (!mounted.current) return
      if (preview.already_enrolled) navigate(`/learn/courses/${preview.course_id}`, { replace })
      else navigate('/join?code=' + encodeURIComponent(code), { replace, state: { preview: { ...preview, code } } })
    } catch (error) {
      if (mounted.current) setFailure(error)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return {
    lookUp,
    busy,
    failure,
    notFound: errorCode(failure) === 'ENROLL_CODE_NOT_FOUND',
    clearFailure: () => setFailure(null),
  }
}

/** 查詢失敗的說明（X3m）：找不到代碼有專用的標題與說明，其他錯誤用共用的錯誤文字。 */
export function JoinCodeErrorText({ failure }: { failure: unknown }) {
  const { t } = useT('home')
  return errorCode(failure) === 'ENROLL_CODE_NOT_FOUND'
    ? <><strong>{t('join.notFoundTitle')}</strong><span>{t('join.notFoundBody')}</span></>
    : <span>{errorMessage(t, failure)}</span>
}
