import type zhHant from '../zh-Hant/learn';
import type { Shape } from '../../shape';

const learn: Shape<typeof zhHant> = {
  breadcrumb: '我学的课',
  teacher: '{{name}} 老师',
  code: '课程代码',
  copyCode: '复制课程代码',
  filterLabel: '筛选活动',
  filters: {
    all: '全部',
    open: '进行中',
    scheduled: '即将开始',
    ended: '已结束',
  },
  sections: {
    open: '进行中',
    scheduled: '即将开始',
    ended: '已结束',
  },
  questions: '{{count}} 题',
  openUntil: '开放到 {{end}}',
  phoneOpen: '{{questions}} ・ 开放到 {{end}}',
  opensAt: '{{start}} 开放',
  endedAt: '{{end}} 结束',
  start: '开始',
  nothing: '老师还没有开放活动',
  notFound: {
    title: '找不到这门课',
    body: '这门课可能不存在，或你还没有加入。',
    back: '返回首页',
  },
  noMatch: '没有符合的活动',
};
export default learn;
