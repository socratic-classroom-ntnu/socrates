import type zhHant from '../zh-Hant/learn';
import type { Shape } from '../../shape';

const learn: Shape<typeof zhHant> = {
  breadcrumb: 'Courses', breadcrumbLabel: 'Course path',
  teacher: 'Teacher: {{name}}',
  code: 'Course code',
  copyCode: 'Copy course code',
  filterLabel: 'Filter activities',
  filters: {
    all: 'All',
    open: 'Open',
    scheduled: 'Coming up',
    ended: 'Ended',
  },
  sections: {
    open: 'Open',
    scheduled: 'Coming up',
    ended: 'Ended',
  },
  questions: '{{count}} questions',
  questions_one: '{{count}} question',
  questions_other: '{{count}} questions',
  openUntil: 'Open until {{end}}',
  phoneOpen: '{{questions}} · open until {{end}}',
  opensAt: 'Opens {{start}}',
  endedAt: 'Ended {{end}}',
  start: 'Start',
  nothing: 'Your teacher has not opened an activity yet',
  notFound: {
    title: 'Course not found',
    body: 'This course may not exist, or you have not joined it yet.',
    back: 'Back to home',
  },
  noMatch: 'No matching activities',
};
export default learn;
