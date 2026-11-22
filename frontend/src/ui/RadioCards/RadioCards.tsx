import { useId } from 'react'
import styles from './RadioCards.module.css'

export type RadioCardOption<T extends string> = {
  value: T
  label: string
  description?: string
  disabled?: boolean
}

export function RadioCards<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled = false,
}: {
  legend: string
  name: string
  options: readonly RadioCardOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const groupId = useId()
  return <fieldset className={styles.group} disabled={disabled}>
    <legend className={styles.legend}>{legend}</legend>
    <div className={styles.options}>
      {options.map((option, index) => {
        const labelId = `${groupId}-${index}-label`
        const descriptionId = `${groupId}-${index}-description`
        return <label key={option.value} className={styles.card}>
          <input
            className={styles.radio}
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            aria-labelledby={labelId}
            aria-describedby={option.description ? descriptionId : undefined}
            onChange={() => onChange(option.value)}
          />
          <span className={styles.text}>
            <span id={labelId} className={styles.label}>{option.label}</span>
            {option.description && <span id={descriptionId} className={styles.description}>{option.description}</span>}
          </span>
        </label>
      })}
    </div>
  </fieldset>
}
