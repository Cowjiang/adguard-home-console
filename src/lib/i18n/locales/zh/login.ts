/** 登录页文案 */

const zhLogin = {
  serverAddress: '服务器地址',
  username: '用户名',
  password: '密码',
  connect: '连接',
  credentialNote: '凭据仅保存在本机浏览器中,通过本地服务转发请求。',
  versionNote: '支持 AdGuard Home v0.107+',
  badCredentials: '用户名或密码错误',
  cannotConnect: '无法连接到服务器',
  notAgh: '响应不是 AdGuard Home',

  // Managed mode
  directMode: '直连模式',
  managedMode: '托管模式',
  consoleServerAddress: 'Console 服务端地址',
  fetchInstances: '拉取托管实例',
  fetchingInstances: '正在获取托管实例...',
  noManagedInstances: '该 Console 服务端暂无托管实例',
  managedInstances: '托管实例列表',
  activateInstanceTitle: '激活实例会话',
  activateInstanceDesc: '请输入该 AdGuard Home 实例的登录密码。凭据仅保存在本地设备，用于端侧零知识加解密，绝不会发送给 Console 服务端。',
  activateAndConnect: '激活并连接',
  registerNewInstance: '登记新托管实例',
  registerAndConnect: '登记并进入',
  instanceNameOptional: '实例名称（可选）',
  cancel: '取消',
  fetchFailed: '拉取实例失败: {{msg}}',
}

export default zhLogin
