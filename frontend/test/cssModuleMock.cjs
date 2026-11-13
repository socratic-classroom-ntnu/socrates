// CSS Modules 在 jest 裡回傳 class 的原名（styles.primary === 'primary'），測試才看得到套了哪個 variant
module.exports = new Proxy({}, { get: (_, key) => (key === '__esModule' ? false : key) })
