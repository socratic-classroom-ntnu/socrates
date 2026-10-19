import type zhHant from '../zh-Hant/shell';
import type { Shape } from '../../shape';

const shell: Shape<typeof zhHant> = {
  nav: {
    label: 'Main menu',
    home: 'Home',
    teaching: 'My teaching',
    bank: 'My question bank',
    store: 'Question store',
    settings: 'AI connections',
  },
  skip: 'Skip to main content',
  language: 'Language',
  logout: 'Log out',
};
export default shell;
