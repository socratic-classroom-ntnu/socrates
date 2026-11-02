import type zhHant from '../zh-Hant/home';
import type { Shape } from '../../shape';

const home: Shape<typeof zhHant> = {
  greeting: {
    morning: 'Good morning, {{name}}',
    afternoon: 'Good afternoon, {{name}}',
    evening: 'Good evening, {{name}}',
  },
  tabs: {
    label: 'Home sections',
    learn: 'My courses',
    teach: 'My teaching',
  },
  join: {
    label: 'Course code',
    placeholder: 'Enter the 8-character course code',
    phonePlaceholder: 'Enter course code',
    submit: 'Join course',
    phoneSubmit: 'Join',
    scan: 'Scan',
    busy: 'Checking…',
    notFoundTitle: 'Course code not found',
    notFoundBody: 'Check the 8-character code from your teacher again. If it is typed correctly, ask your teacher whether the code has changed.',
  },
  create: 'Create course',
  phoneHint: 'Use a computer to manage courses and activities',
  empty: {
    learnTitle: 'No courses yet',
    learnBody: 'Courses you join will appear here',
    teachTitle: 'No courses you teach yet',
    teachBody: 'Courses you create will appear here',
  },
  teaching: {
    live: 'In class',
    students: '{{count}} students',
    students_one: '{{count}} student',
    students_other: '{{count}} students',
    activities: '{{count}} activities',
    activities_one: '{{count}} activity',
    activities_other: '{{count}} activities',
    counts: '{{students}} · {{activities}}',
    copyCode: 'Copy course code',
  },
  learning: {
    open: 'Open',
    openCount: '{{count}} open',
    none: 'No open activities',
    phoneNone: 'Nothing open',
    questions: '{{count}} questions',
    questions_one: '{{count}} question',
    questions_other: '{{count}} questions',
    openMeta: '{{questions}} · open until {{end}}',
    phoneOpenMeta: 'Open until {{end}}',
    next: 'Next: {{title}}',
    opensAt: 'Opens {{start}}',
    last: 'Last: {{title}}',
    endedAt: 'Ended {{end}}',
    nothing: 'Your teacher has not opened an activity yet',
    start: 'Start',
  },
  loadFailed: 'The course list did not load.',
};
export default home;
