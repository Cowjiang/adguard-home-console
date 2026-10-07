/** 代理适配层（Express/Rust 双端）生成的错误文案，按 ApiError.kind 映射；
 *  适配器只报 kind，不携带文案 */
const zhProxy = {
  missingTarget: '缺少目标地址',
  invalidTarget: '目标地址必须是 http:// 或 https://',
  timeout: '连接超时,请检查地址与网络',
  crossHostRedirect: '上游重定向到其他主机,已拒绝转发凭据',
  invalidRedirect: '上游重定向地址无效',
  network: '网络错误,无法连接上游',
}

export default zhProxy
