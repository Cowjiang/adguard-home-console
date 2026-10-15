/**
 * Semantic difference calculation engine between current live configuration and a snapshot payload.
 */
import type {
  DiffItem,
  Filter,
  ModuleDiffSummary,
  SnapshotModule,
  SnapshotPayload,
} from './types'

function arrayDiff(
  module: SnapshotModule,
  pathPrefix: string,
  label: string,
  currentArr: string[] = [],
  targetArr: string[] = []
): DiffItem[] {
  const diffs: DiffItem[] = []
  const currentSet = new Set(currentArr)
  const targetSet = new Set(targetArr)

  // Elements in target but not in current -> added by restore
  for (const item of targetArr) {
    if (!currentSet.has(item)) {
      diffs.push({
        module,
        path: `${pathPrefix}[+]`,
        label: `${label} (+)`,
        oldValue: undefined,
        newValue: item,
        type: 'added',
      })
    }
  }

  // Elements in current but not in target -> deleted by restore
  for (const item of currentArr) {
    if (!targetSet.has(item)) {
      diffs.push({
        module,
        path: `${pathPrefix}[-]`,
        label: `${label} (-)`,
        oldValue: item,
        newValue: undefined,
        type: 'deleted',
      })
    }
  }

  return diffs
}

function diffFilterList(
  currentFilters: Filter[] = [],
  targetFilters: Filter[] = [],
  whitelist: boolean
): DiffItem[] {
  const diffs: DiffItem[] = []
  const prefix = whitelist ? 'whitelist_filters' : 'filters'
  const typeName = whitelist ? 'Allowlist' : 'Blocklist'
  const cMap = new Map(currentFilters.map((f) => [f.url, f]))
  const tMap = new Map(targetFilters.map((f) => [f.url, f]))

  for (const [url, tf] of tMap) {
    const cf = cMap.get(url)
    if (!cf) {
      diffs.push({
        module: 'filters',
        path: `${prefix}[${url}]`,
        label: `${typeName}: ${tf.name}`,
        oldValue: undefined,
        newValue: `${tf.name} (${tf.enabled ? 'Enabled' : 'Disabled'})`,
        type: 'added',
      })
    } else if (cf.enabled !== tf.enabled || cf.name !== tf.name) {
      diffs.push({
        module: 'filters',
        path: `${prefix}[${url}]`,
        label: `${typeName}: ${tf.name}`,
        oldValue: `${cf.name} (${cf.enabled ? 'Enabled' : 'Disabled'})`,
        newValue: `${tf.name} (${tf.enabled ? 'Enabled' : 'Disabled'})`,
        type: 'modified',
      })
    }
  }

  for (const [url, cf] of cMap) {
    if (!tMap.has(url)) {
      diffs.push({
        module: 'filters',
        path: `${prefix}[${url}]`,
        label: `${typeName}: ${cf.name}`,
        oldValue: cf.name,
        newValue: undefined,
        type: 'deleted',
      })
    }
  }

  return diffs
}

export function computeSnapshotDiff(
  current: SnapshotPayload,
  target: SnapshotPayload,
  modules?: readonly SnapshotModule[]
): ModuleDiffSummary[] {
  const checkModules = modules && modules.length > 0 ? modules : (Object.keys(target) as SnapshotModule[])
  const summaries: ModuleDiffSummary[] = []

  for (const mod of checkModules) {
    const diffs: DiffItem[] = []

    switch (mod) {
      case 'dns': {
        const cDns = current.dns
        const tDns = target.dns
        if (!tDns) break

        if (!cDns) {
          diffs.push({
            module: 'dns',
            path: 'dns',
            label: 'DNS Settings',
            oldValue: undefined,
            newValue: 'Full DNS Configuration',
            type: 'added',
          })
          break
        }

        diffs.push(
          ...arrayDiff('dns', 'dns.upstream_dns', 'Upstream DNS', cDns.upstream_dns || [], tDns.upstream_dns || [])
        )
        diffs.push(
          ...arrayDiff('dns', 'dns.bootstrap_dns', 'Bootstrap DNS', cDns.bootstrap_dns || [], tDns.bootstrap_dns || [])
        )
        diffs.push(
          ...arrayDiff('dns', 'dns.fallback_dns', 'Fallback DNS', cDns.fallback_dns || [], tDns.fallback_dns || [])
        )

        const scalarProps: (keyof typeof tDns)[] = [
          'blocking_mode',
          'cache_size',
          'cache_ttl_min',
          'cache_ttl_max',
          'cache_optimistic',
          'ratelimit',
          'dnssec_enabled',
          'edns_cs_enabled',
          'disable_ipv6',
        ]

        for (const prop of scalarProps) {
          if (tDns[prop] !== undefined && cDns[prop] !== undefined && tDns[prop] !== cDns[prop]) {
            diffs.push({
              module: 'dns',
              path: `dns.${String(prop)}`,
              label: String(prop),
              oldValue: cDns[prop],
              newValue: tDns[prop],
              type: 'modified',
            })
          }
        }
        break
      }

      case 'user_rules': {
        const cRules = current.user_rules || []
        const tRules = target.user_rules || []
        diffs.push(...arrayDiff('user_rules', 'user_rules', 'Custom Filtering Rule', cRules, tRules))
        break
      }

      case 'filters': {
        diffs.push(
          ...diffFilterList(current.filters?.filters || [], target.filters?.filters || [], false)
        )
        diffs.push(
          ...diffFilterList(current.filters?.whitelist_filters || [], target.filters?.whitelist_filters || [], true)
        )
        break
      }

      case 'rewrites': {
        const cRewrites = current.rewrites || []
        const tRewrites = target.rewrites || []
        const toKey = (r: { domain: string; answer: string }) => `${r.domain.toLowerCase()} -> ${r.answer}`
        const cSet = new Set(cRewrites.map(toKey))
        const tSet = new Set(tRewrites.map(toKey))

        for (const r of tRewrites) {
          const k = toKey(r)
          if (!cSet.has(k)) {
            diffs.push({
              module: 'rewrites',
              path: `rewrites[${r.domain}]`,
              label: `DNS Rewrite: ${r.domain}`,
              oldValue: undefined,
              newValue: r.answer,
              type: 'added',
            })
          }
        }

        for (const r of cRewrites) {
          const k = toKey(r)
          if (!tSet.has(k)) {
            diffs.push({
              module: 'rewrites',
              path: `rewrites[${r.domain}]`,
              label: `DNS Rewrite: ${r.domain}`,
              oldValue: r.answer,
              newValue: undefined,
              type: 'deleted',
            })
          }
        }
        break
      }

      case 'clients': {
        const cClients = current.clients || []
        const tClients = target.clients || []
        const cMap = new Map(cClients.map((c) => [c.name, c]))
        const tMap = new Map(tClients.map((c) => [c.name, c]))

        for (const [name, tc] of tMap) {
          const cc = cMap.get(name)
          if (!cc) {
            diffs.push({
              module: 'clients',
              path: `clients[${name}]`,
              label: `Client: ${name}`,
              oldValue: undefined,
              newValue: `IDs: ${(tc.ids || []).join(', ')}`,
              type: 'added',
            })
          } else {
            // Fine-grained field comparisons
            const changedFields: string[] = []
            if (JSON.stringify(cc.ids || []) !== JSON.stringify(tc.ids || [])) {
              changedFields.push(`IDs: [${(cc.ids || []).join(', ')}] -> [${(tc.ids || []).join(', ')}]`)
            }
            if (JSON.stringify(cc.tags || []) !== JSON.stringify(tc.tags || [])) {
              changedFields.push(`Tags: [${(cc.tags || []).join(', ')}] -> [${(tc.tags || []).join(', ')}]`)
            }
            if (JSON.stringify(cc.blocked_services || []) !== JSON.stringify(tc.blocked_services || [])) {
              changedFields.push('Blocked Services')
            }
            if (JSON.stringify(cc.upstreams || []) !== JSON.stringify(tc.upstreams || [])) {
              changedFields.push('Upstreams')
            }
            if (
              cc.filtering_enabled !== tc.filtering_enabled ||
              cc.parental_enabled !== tc.parental_enabled ||
              cc.safebrowsing_enabled !== tc.safebrowsing_enabled
            ) {
              changedFields.push('Policies')
            }

            if (changedFields.length > 0) {
              diffs.push({
                module: 'clients',
                path: `clients[${name}]`,
                label: `Client: ${name} (${changedFields.join(', ')})`,
                oldValue: `Tags: ${(cc.tags || []).join(', ')}`,
                newValue: `Tags: ${(tc.tags || []).join(', ')}`,
                type: 'modified',
              })
            }
          }
        }

        for (const [name, cc] of cMap) {
          if (!tMap.has(name)) {
            diffs.push({
              module: 'clients',
              path: `clients[${name}]`,
              label: `Client: ${name}`,
              oldValue: `IDs: ${(cc.ids || []).join(', ')}`,
              newValue: undefined,
              type: 'deleted',
            })
          }
        }
        break
      }

      case 'access': {
        const cAcc = current.access || { allowed_clients: [], disallowed_clients: [], blocked_hosts: [] }
        const tAcc = target.access || { allowed_clients: [], disallowed_clients: [], blocked_hosts: [] }
        diffs.push(
          ...arrayDiff('access', 'access.allowed', 'Allowed Clients', cAcc.allowed_clients, tAcc.allowed_clients)
        )
        diffs.push(
          ...arrayDiff('access', 'access.disallowed', 'Disallowed Clients', cAcc.disallowed_clients, tAcc.disallowed_clients)
        )
        diffs.push(
          ...arrayDiff('access', 'access.hosts', 'Blocked Hosts', cAcc.blocked_hosts, tAcc.blocked_hosts)
        )
        break
      }

      case 'general': {
        const cGen = current.general
        const tGen = target.general
        if (tGen && cGen) {
          if (tGen.querylog?.interval !== cGen.querylog?.interval) {
            diffs.push({
              module: 'general',
              path: 'general.querylog.interval',
              label: 'Query Log Retention',
              oldValue: cGen.querylog?.interval,
              newValue: tGen.querylog?.interval,
              type: 'modified',
            })
          }
          if (tGen.stats?.interval !== cGen.stats?.interval) {
            diffs.push({
              module: 'general',
              path: 'general.stats.interval',
              label: 'Stats Retention',
              oldValue: cGen.stats?.interval,
              newValue: tGen.stats?.interval,
              type: 'modified',
            })
          }
          diffs.push(
            ...arrayDiff('general', 'general.querylog.ignored', 'Querylog Ignored Domains', cGen.querylog?.ignored || [], tGen.querylog?.ignored || [])
          )
        }
        break
      }

      case 'blocked_services': {
        const cServices = current.blocked_services?.ids || []
        const tServices = target.blocked_services?.ids || []
        diffs.push(...arrayDiff('blocked_services', 'blocked_services', 'Blocked Service ID', cServices, tServices))
        break
      }

      case 'safesearch': {
        const cSs = current.safesearch
        const tSs = target.safesearch
        if (tSs && cSs) {
          if (tSs.enabled !== cSs.enabled) {
            diffs.push({
              module: 'safesearch',
              path: 'safesearch.enabled',
              label: 'SafeSearch Master Switch',
              oldValue: cSs.enabled,
              newValue: tSs.enabled,
              type: 'modified',
            })
          }
        }
        break
      }
    }

    summaries.push({
      module: mod,
      hasChanges: diffs.length > 0,
      diffs,
    })
  }

  return summaries
}
