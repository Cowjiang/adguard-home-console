/** Copy for adapter-generated proxy errors, mapped from ApiError.kind; the
 *  adapters only report the kind, never the copy */
const enProxy = {
  missingTarget: 'Missing target address',
  invalidTarget: 'Target must be an http:// or https:// address',
  timeout: 'Connection timed out. Check the address and network.',
  crossHostRedirect: 'Upstream redirected to another host; credentials were not forwarded.',
  invalidRedirect: 'Upstream redirect location is invalid.',
  network: 'Network error. Cannot reach the upstream.',
}

export default enProxy
