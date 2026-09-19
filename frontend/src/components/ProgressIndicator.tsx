type Props = { currentIndex: number; total: number }

/**
 * 只顯示數量，**絕不顯示未進入情境的名稱**（設計規格 §4.1）。
 *
 * 變形題的效果依賴學生答第一題時不知道第二題會怎麼翻轉他的答案。
 * 後端也不會回傳那些標題——這裡不必過濾，只是不要去要。
 */
export default function ProgressIndicator({ currentIndex, total }: Props) {
  return <p className="progress">{`情境 ${currentIndex + 1} / ${total}`}</p>
}
