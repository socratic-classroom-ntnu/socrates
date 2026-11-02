import type zhHant from '../zh-Hant/shell';
import type { Shape } from '../../shape';

const shell: Shape<typeof zhHant> = {
  nav: {
    label: '主菜单',
    home: '首页',
    groups: '分组课',
    bank: '个人题库',
    store: '题库商店',
    settings: 'AI 连接设置',
  },
  skip: '跳到主要内容',
  language: '语言',
  logout: '退出登录',
  account: {
    menu: '账号菜单',
    settings: '个人设置',
    language: '语言 — {{name}}',
  },
  collapse: '收起侧边栏',
  expand: '展开侧边栏',
  groups: {
    teacherLink: '管理分组课（教师端）',
  },
};
export default shell;
