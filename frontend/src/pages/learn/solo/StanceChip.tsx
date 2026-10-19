import { optionLetter, type SoloQuestion } from './soloView'

/** A chosen stance as a chip in its letter's colour (spec §4.9: A 橘、B 藍、C 黃、D 綠). */
export function StanceChip({ question }: { question: SoloQuestion }) {
  const index = question.options.findIndex(option => option.id === question.stance?.option_id)
  if (index < 0) return null
  const letter = optionLetter(index)
  return <span className="solo-stance-chip" data-option={letter}>
    <span>{letter}</span>{question.options[index].text}
  </span>
}
