import type zhHant from '../zh-Hant/shell';
import type { Shape } from '../../shape';

const shell: Shape<typeof zhHant> = {
  nav: {
    admin: '后台',
    label: '主菜单',
    home: '首页',
    dialogues: '我的对话',
    me: '我',
    bank: '个人题库',
    store: '题库商店',
    settings: 'AI 连接设置',
  },
  skip: '跳到主要内容',
  language: '语言',
  logout: '退出登录',
  account: {
    menu: '账号菜单',
    sheet: '账号',
    tag: { student: '学生', teacher: '老师', guest: '访客' },
    guestUntil: '保留到 {{date}}',
    guestNote: '访客只在这个浏览器有效；换设备或清除浏览器数据后，记录无法找回。',
    guestRegister: '注册以保留记录',
    guestLogin: '已有账号？登录',
    settings: '个人设置',
    language: '语言 — {{name}}',
  },
  collapse: '收起侧边栏',
  expand: '展开侧边栏',
  groups: {
    teacherLink: '管理分组课（教师端）',
  },
  crossRole: {
    illustration: '两扇门，其中一扇上锁',
    home: '回首页',
    switch: { teacher: '退出，改用老师账号', student: '退出，改用学生账号' },
    teacherPage: { title: '这是老师的页面', body1: '你现在登录的是学生账号。', body2: '如果你是老师，请退出后改用老师账号登录。' },
    studentPage: { title: '这是学生的页面', body1: '你现在登录的是老师账号。', body2: '学生的页面要用学生账号打开。' },
    join: {
      title: '要用学生账号才能加入',
      scannedCourse: '你扫描的是课程二维码',
      scannedActivity: '你扫描的是活动二维码',
      body1: '老师账号不能加入课程或活动。',
      body2: '要以学生身份参加，请退出后用学生账号登录或注册，再重新扫描。',
    },
  },
};
export default shell;
