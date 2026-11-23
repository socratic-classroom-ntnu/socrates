
import { classNames } from '../classNames'
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
  className,
}: {
  legend: string
  name: string
  options: readonly RadioCardOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  /** The page's own class, added after the component's on the fieldset. */
  className?: string
}) {
  return (
    <fieldset className={classNames(styles.fieldset, className)} disabled={disabled}>
      <legend className={styles.legend}>{legend}</legend>

      <div className={styles.options}>
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
