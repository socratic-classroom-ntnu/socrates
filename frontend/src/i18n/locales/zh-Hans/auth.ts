import type zhHant from '../zh-Hant/auth';
import type { Shape } from '../../shape';

const auth: Shape<typeof zhHant> = {
  hero: {
    eyebrow: 'SOCRATES · 苏格拉底课堂',
    tagline: '从一个问题，\n看见自己的原则。',
    sub: '表达、追问、相遇。每个观点都有自己的位置。',
  },
  fields: {
    identifier: '用户名或 Email',
    username: '用户名',
    email: 'Email',
    password: '密码',
    newPassword: '新密码',
  },
  login: { title: '欢迎回来', submit: '登录' },
  register: {
    title: '创建账号',
    hint: '密码至少 12 个字符。注册后会发送一封验证邮件到你的 Email。',
    submit: '注册',
  },
  forgot: {
    title: '重置密码',
    hint: '输入注册时的 Email，我们会给你发送一封重置密码的邮件。',
    submit: '发送重置邮件',
    sent: '如果这个 Email 注册过，重置密码的邮件已经发出。',
  },
  reset: {
    title: '设置新密码',
    submit: '设置新密码',
    done: '密码已经更新，请用新密码登录。',
  },
  fieldErrors: {
    username: {
      missing: '请填写用户名。',
      tooShort: '用户名至少要 {{min}} 个字符，请重新输入。',
      tooLong: '用户名最多 {{max}} 个字符，请重新输入。',
      format: '用户名格式不正确，请重新输入。',
      pattern: '用户名只能用文字、数字、下划线（_）、点（.）或连字符（-），不能有空格。',
    },
    email: {
      missing: '请填写 Email。',
      tooShort: 'Email 至少要 {{min}} 个字符，请重新输入。',
      tooLong: 'Email 最多 {{max}} 个字符，请重新输入。',
      format: 'Email 格式不正确，请重新输入。',
      pattern: 'Email 格式不正确，请重新输入。',
    },
    password: {
      missing: '请填写密码。',
      tooShort: '密码至少要 {{min}} 个字符，请重新输入。',
      tooLong: '密码最多 {{max}} 个字符，请重新输入。',
      format: '密码格式不正确，请重新输入。',
      pattern: '密码格式不正确，请重新输入。',
    },
  },
  busy: '处理中…',
  links: { login: '返回登录', register: '注册', forgot: '忘记密码' },
  verify: {
    title: '确认你的 Email',
    body: '我们发送了一封验证邮件到 {{email}}。打开邮件里的链接，就能开始加入课程。',
    waiting: '等待验证中，验证完成后这一页会自动继续',
    resend: '重新发送验证邮件',
    resent: '验证邮件已重新发送。',
    checked: '我已经验证了',
    help: '没收到？看看垃圾邮件箱。Email 填错了，可以退出后用正确的 Email 重新注册。',
    verifying: '正在验证你的 Email…',
    success: 'Email 验证完成。',
    failed: '这个验证链接已经失效，请重新发送验证邮件。',
    notYet: '还没有完成验证，请打开邮件里的链接。',
    cooldown: '{{seconds}} 秒后可再次发送',
    localPreview: '本机测试：打开这次的验证链接',
    loginToResend: '登录后重新发送验证邮件',
    logout: '退出登录',
  },
};
export default auth;
