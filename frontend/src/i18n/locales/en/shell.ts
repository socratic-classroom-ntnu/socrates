import type zhHant from '../zh-Hant/shell';
import type { Shape } from '../../shape';

const shell: Shape<typeof zhHant> = {
  nav: {
    label: 'Main menu',
    home: 'Home',
    groups: 'Group classes',
    bank: 'My question bank',
    store: 'Question store',
    settings: 'AI connections',
  },
  skip: 'Skip to main content',
  language: 'Language',
  logout: 'Log out',
  account: {
    menu: 'Account menu',
    settings: 'Personal settings',
    language: 'Language — {{name}}',
  },
  collapse: 'Collapse sidebar',
  expand: 'Expand sidebar',
  groups: {
    teacherLink: 'Manage group classes (teacher)',
  },
};
export default shell;
