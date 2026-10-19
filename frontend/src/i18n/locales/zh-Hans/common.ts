import type zhHant from '../zh-Hant/common';
import type { Shape } from '../../shape';

const common: Shape<typeof zhHant> = {
  brand: '苏格拉底课堂',
  loading: '加载中…',
  notFound: {
    title: '找不到这个页面',
    body: '网址可能输错了，或者这个页面已经移除。',
    back: '返回首页',
  },
  errors: {
    AUTH_INVALID_CREDENTIALS: '用户名、Email 或密码不正确。',
    AUTH_TOKEN_INVALID: '这个链接已经失效，请重新申请。',
    ACCOUNT_DATA_TAKEN: '账号资料已经有人使用，请前往登录或重置密码。',
    USERNAME_TAKEN: '这个用户名已经有人使用，请换一个。',
    EMAIL_TAKEN: '这个 Email 已经注册过了，请直接登录；忘记密码可以重置。',
    ACCOUNT_PENDING_VERIFICATION: '这个用户名或 Email 已注册，正在等待 Email 验证。如果是你的账号，请直接登录并重新发送验证邮件；如果不是，等验证链接过期（最后一次发送后 24 小时）就会释放，届时可以再注册。',
    LOGIN_REQUIRED: '请先登录。',
    RATE_LIMITED: '操作太频繁，请稍后再试。',
    invalidInput: '有字段内容不符合格式，请检查后再试。',
    server: '服务器暂时无法处理，请稍后再试。',
    generic: '操作没有完成，请稍后再试。',
  },
  comingSoon: {
    title: '功能开发中',
    body: '这个功能还在建设中，之后会开放。',
    back: '返回首页',
  },
};
export default common;
