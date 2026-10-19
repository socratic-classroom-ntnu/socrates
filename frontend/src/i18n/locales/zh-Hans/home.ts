import type zhHant from '../zh-Hant/home';
import type { Shape } from '../../shape';

const home: Shape<typeof zhHant> = {
  greeting: {
    morning: '早上好，{{name}}',
    afternoon: '下午好，{{name}}',
    evening: '晚上好，{{name}}',
  },
  tabs: {
    label: '首页分页',
    learn: '我学的课',
    teach: '我教的课',
  },
  join: {
    label: '课程代码',
    placeholder: '输入 8 位课程代码',
    phonePlaceholder: '输入课程代码',
    submit: '加入课程',
    phoneSubmit: '加入',
    scan: '扫描',
    busy: '查询中…',
    notFoundTitle: '找不到这个课程代码',
    notFoundBody: '请再对照一次老师给的 8 位课程代码。如果确定没输错，请向老师确认代码是否已更换。',
  },
  create: '创建课程',
  phoneHint: '管理课程与活动请用电脑打开',
  empty: {
    learnTitle: '暂无已加入的课程',
    learnBody: '加入老师的课程后，将在此处显示',
    teachTitle: '暂无任教课程',
    teachBody: '创建课程后，将在此处显示',
  },
  teaching: {
    live: '上课中',
    students: '学生 {{count}} 人',
    activities: '活动 {{count}} 个',
    counts: '{{students}} ・ {{activities}}',
    copyCode: '复制课程代码',
  },
  learning: {
    open: '进行中',
    openCount: '进行中 {{count}}',
    none: '没有进行中的活动',
    phoneNone: '没有进行中',
    questions: '{{count}} 题',
    openMeta: '{{questions}} ・ 开放到 {{end}}',
    phoneOpenMeta: '开放到 {{end}}',
    next: '下一个：{{title}}',
    opensAt: '{{start}} 开放',
    last: '上次：{{title}}',
    endedAt: '{{end}} 结束',
    nothing: '老师还没有开放活动',
    start: '开始',
  },
  loadFailed: '课程列表没有加载成功。',
};
export default home;
