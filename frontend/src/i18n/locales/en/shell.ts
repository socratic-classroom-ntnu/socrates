import type zhHant from '../zh-Hant/shell';
import type { Shape } from '../../shape';

const shell: Shape<typeof zhHant> = {
  nav: {
    label: 'Main menu',
    home: 'Home',
    dialogues: 'My dialogues',
    me: 'Me',
    bank: 'My question bank',
    store: 'Question store',
    settings: 'AI connections',
  },
  skip: 'Skip to main content',
  language: 'Language',
  logout: 'Log out',
  account: {
    menu: 'Account menu',
    sheet: 'Account',
    tag: { student: 'Student', teacher: 'Teacher', guest: 'Guest' },
    guestUntil: 'Kept until {{date}}',
    guestNote: 'A guest exists only in this browser. On another device, or after clearing browser data, the records cannot be recovered.',
    guestRegister: 'Sign up to keep your records',
    guestLogin: 'Have an account? Log in',
    settings: 'Personal settings',
    language: 'Language — {{name}}',
  },
  collapse: 'Collapse sidebar',
  expand: 'Expand sidebar',
  groups: {
    teacherLink: 'Manage group classes (teacher)',
  },
  crossRole: {
    illustration: 'Two doors, one of them locked',
    home: 'Back to home',
    switch: { teacher: 'Log out and use a teacher account', student: 'Log out and use a student account' },
    teacherPage: { title: 'This page is for teachers', body1: 'You are signed in with a student account.', body2: 'If you are a teacher, log out and sign in with your teacher account.' },
    studentPage: { title: 'This page is for students', body1: 'You are signed in with a teacher account.', body2: 'Student pages open with a student account.' },
    join: {
      title: 'Joining needs a student account',
      scannedCourse: 'You scanned the course QR code for',
      scannedActivity: 'You scanned an activity QR code for',
      body1: 'Teacher accounts cannot join a course or activity.',
      body2: 'To take part as a student, log out, sign in or sign up with a student account, and scan again.',
    },
  },
  // 訪客登出前先確認（組員 Figma「免註冊加入」G15）：先註冊、仍要登出、✕ 取消
  guestLogout: {
    title: 'Log out of this guest session?',
    body: 'After you log out, this guest and its records cannot be recovered. Sign up first to keep your courses and conversations.',
    anyway: 'Log out anyway',
    register: 'Sign up first',
  },
};
export default shell;
