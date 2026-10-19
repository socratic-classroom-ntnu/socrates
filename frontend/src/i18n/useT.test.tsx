import { act, render, screen } from '@testing-library/react';
import { applyLocale } from './index';
import { STORAGE_KEY } from './locale';
import { useT } from './useT';

function Brand() {
  const { t, locale } = useT('common');
  return <p data-locale={locale}>{t('brand')}</p>;
}

test('tests start in zh-Hant and switching re-renders with the new language', async () => {
  render(<Brand />);
  expect(screen.getByText('蘇格拉底課堂')).toHaveAttribute('data-locale', 'zh-Hant');

  await act(async () => { await applyLocale('en'); });

  expect(screen.getByText('Socrates Classroom')).toHaveAttribute('data-locale', 'en');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
  expect(document.documentElement.lang).toBe('en');
});
