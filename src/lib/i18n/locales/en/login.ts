/** Login page strings */

const enLogin = {
  serverAddress: 'Server address',
  username: 'Username',
  password: 'Password',
  connect: 'Connect',
  credentialNote: 'Credentials are stored only in this browser; requests are forwarded through the local service.',
  versionNote: 'Works with AdGuard Home v0.107+',
  badCredentials: 'Incorrect username or password',
  cannotConnect: 'Cannot reach the server',
  notAgh: 'The response is not from AdGuard Home',

  // Managed mode
  directMode: 'Direct Mode',
  managedMode: 'Managed Mode',
  consoleServerAddress: 'Console Server Address',
  fetchInstances: 'Fetch Instances',
  fetchingInstances: 'Fetching managed instances...',
  noManagedInstances: 'No managed instances on this Console server',
  managedInstances: 'Managed Instances',
  activateInstanceTitle: 'Activate Instance Session',
  activateInstanceDesc: 'Enter the password for this AdGuard Home instance. Credentials stay strictly on your local device for zero-knowledge end-to-end encryption and are never sent to the console server.',
  activateAndConnect: 'Activate & Connect',
  registerNewInstance: 'Register Managed Instance',
  registerAndConnect: 'Register & Connect',
  instanceNameOptional: 'Instance Name (optional)',
  cancel: 'Cancel',
  fetchFailed: 'Failed to fetch instances: {{msg}}',
}

export default enLogin
