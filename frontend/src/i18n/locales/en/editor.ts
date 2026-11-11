import type zhHant from '../zh-Hant/editor';
import type { Shape } from '../../shape';

const editor: Shape<typeof zhHant> = {
  titleNew: 'New activity',
  titleEdit: 'Edit activity',
  crumb: 'My teaching',
  actions: {
    cancel: 'Cancel',
    saveToList: 'Save to activity list',
    create: 'Create activity',
    saveChanges: 'Save changes',
    delete: 'Delete activity',
    back: 'Back',
    copy: 'Copy as new activity',
    toCourse: 'Back to the course',
  },
  autosave: {
    idle: 'Your work is kept on this device automatically',
    saved: 'Kept on this device',
  },
  restore: {
    title: 'Unfinished work from {{time}} found',
    body: 'This device has work that was never saved. Restore it, or discard it and keep what is shown now?',
    discard: 'Discard',
    restore: 'Restore',
  },
  notices: {
    savedToList: 'Saved to the activity list. Students cannot see it yet',
    saved: 'Changes saved',
    copied: 'This is a copy of "{{title}}". Edit it, then create the activity.',
    publishFailed: 'Your changes are kept but not published; students still see the previous version',
    pending: 'Unpublished changes: students still see the previous version. Press "Save changes" to publish again.',
    stale: 'The activity changed in the meantime, so it was reloaded',
    notFound: 'This activity no longer exists',
  },
  locked: {
    title: 'The topic is locked',
    body: 'You can still change the activity name and end time. To change the topic, copy it as a new activity.',
    pendingBody: 'The activity was locked before your changes were published, so students still see the previous version. Copy it as a new activity to keep your changes.',
    readonlyBody: 'This activity has ended and can no longer be edited. Copy it as a new activity to use it again.',
  },
  sections: {
    basics: 'Basics',
    collapse: 'Collapse "{{name}}"',
    expand: 'Expand "{{name}}"',
  },
  fields: {
    required: '(required)',
    title: 'Topic',
    titleHint: 'Write a few sentences. Socrates starts from it to write a first scenario for each student. It is also the activity name.',
    start: 'Start',
    startNow: 'Open as soon as it is created',
    startAt: 'At a set time',
    opened: 'Opened {{time}}',
    end: 'End',
    windowHint: 'It ends automatically at that time; you can also start or end it early from the activity page. Afterwards students can only review their own record.',
    lockedWindowHint: 'You can extend the end time so students who are not finished can continue; end it early from the activity page.',
  },
  errors: {
    title: 'Enter the topic',
    start: 'Enter a start time',
    end: 'Enter an end time',
    endBeforeStart: 'The end must be after the start',
    endPast: 'The end time has already passed',
    startPast: 'The start time has already passed. To open right away, choose "Open as soon as it is created".',
    summary: 'Some fields are missing.',
    missing: 'is not filled in',
    beforeStart: 'must be after the start',
    past: 'has already passed',
  },
  loadFailed: 'The activity did not load.',
};
export default editor;
