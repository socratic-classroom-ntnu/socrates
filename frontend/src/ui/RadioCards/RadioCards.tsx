
import type { CSSProperties } from 'react'
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
  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend className={styles.legend}>{legend}</legend>

      <div
        className={styles.options}
        style={{
          '--radio-cards-count': options.length,
          '--radio-cards-mobile-count': options.length > 3 ? 2 : options.length,
        } as CSSProperties}
      >
        {options.map(option => (
          <label key={option.value} className={styles.card}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />

            <span className={styles.content}>
              <span className={styles.label}>{option.label}</span>
              {option.description && (
                <span className={styles.description}>
                  {option.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
