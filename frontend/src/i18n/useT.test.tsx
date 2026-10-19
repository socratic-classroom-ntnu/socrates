import { act, render, screen } from '@testing-library/react';
import { applyLocale } from './index';
import { STORAGE_KEY } from './locale';
import { useT } from './useT';

const EN_GENERIC = 'That did not go through. Please try again later.';

function Generic() {
  const { t, locale } = useT('common');
  return <p data-locale={locale}>{t('errors.generic')}</p>;
}

function Brand() {
  const { t } = useT('common');
  return <p>{t('brand')}</p>;
}

test('tests start in zh-Hant and switching re-renders with the new language', async () => {
  render(<Generic />);
  expect(screen.getByText('操作沒有完成，請稍後再試。')).toHaveAttribute('data-locale', 'zh-Hant');

  await act(async () => { await applyLocale('en'); });

  expect(screen.getByText(EN_GENERIC)).toHaveAttribute('data-locale', 'en');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
  expect(document.documentElement.lang).toBe('en');
});

test.each(['zh-Hant', 'zh-Hans', 'en', 'es'] as const)('the brand is the English name in %s', async locale => {
  await act(async () => { await applyLocale(locale); });
  render(<Brand />);
  expect(screen.getByText('Socrates Classroom')).toBeInTheDocument();
});
