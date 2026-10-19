import type zhHant from '../zh-Hant/shell';
import type { Shape } from '../../shape';

const shell: Shape<typeof zhHant> = {
  nav: {
    label: '主菜单',
    home: '首页',
    teaching: '我教的课',
    bank: '个人题库',
    store: '题库商店',
    settings: 'AI 连接设置',
  },
  skip: '跳到主要内容',
  language: '语言',
  logout: '退出登录',
};
export default shell;
