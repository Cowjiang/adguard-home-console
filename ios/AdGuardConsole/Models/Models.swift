import Foundation

// MARK: - 会话配置(对照 auth.tsx SvrConfig)

struct SvrConfig: Codable, Sendable, Equatable, Hashable, Identifiable {
    var url: String
    var username: String
    var password: String

    var id: String { url }
}

// MARK: - /status(单位:protection_disabled_duration 毫秒,start_time 毫秒时间戳)

struct AGHStatus: Codable, Sendable, Equatable {
    var version: String
    var language: String?
    var dnsAddresses: [String]
    var dnsPort: Int
    var httpPort: Int
    var protectionEnabled: Bool
    var protectionDisabledDuration: Int
    var protectionDisabledUntil: String?
    var dhcpAvailable: Bool?
    var running: Bool
    /// 毫秒;真实 AGH 序列化为带小数的 float(如 1789897891068.7437),Int64 会解码失败
    var startTime: Double

    enum CodingKeys: String, CodingKey {
        case version, language, running
        case dnsAddresses = "dns_addresses"
        case dnsPort = "dns_port"
        case httpPort = "http_port"
        case protectionEnabled = "protection_enabled"
        case protectionDisabledDuration = "protection_disabled_duration"
        case protectionDisabledUntil = "protection_disabled_until"
        case dhcpAvailable = "dhcp_available"
        case startTime = "start_time"
    }
}

// MARK: - KVMap:v0.107.79 返回单键对象数组(保序),旧版为字典;统一归一为有序键值对

struct KVPair: Sendable, Equatable, Identifiable {
    var key: String
    var value: Double
    var id: String { key }
}

struct KVMap: Codable, Sendable, Equatable {
    /// 数组形态按原始顺序保留;字典形态无序,按值降序(对齐 Web 版 topN 排序语义)
    var entries: [KVPair]

    init(entries: [KVPair]) { self.entries = entries }

    var asDictionary: [String: Double] {
        Dictionary(entries.map { ($0.key, $0.value) }, uniquingKeysWith: { max($0, $1) })
    }

    var total: Double { entries.reduce(0) { $0 + $1.value } }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let array = try? container.decode([[String: Double]].self) {
            var out: [KVPair] = []
            out.reserveCapacity(array.count)
            for item in array {
                for (key, value) in item { out.append(KVPair(key: key, value: value)) }
            }
            entries = out
        } else if let dict = try? container.decode([String: Double].self) {
            entries = dict.map { KVPair(key: $0.key, value: $0.value) }.sorted { $0.value > $1.value }
        } else {
            throw DecodingError.typeMismatch(
                KVMap.self,
                .init(codingPath: decoder.codingPath, debugDescription: "KVMap 既不是单键对象数组也不是字典")
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(Dictionary(uniqueKeysWithValues: entries.map { ($0.key, $0.value) }))
    }
}

// MARK: - /stats(avg_processing_time 与 top_upstreams_avg_time 是秒,其余统计区间毫秒)

struct AGHStats: Codable, Sendable, Equatable {
    var timeUnits: String?
    var numDnsQueries: Int
    var numBlockedFiltering: Int
    var numReplacedSafebrowsing: Int
    var numReplacedSafesearch: Int
    var numReplacedParental: Int
    var avgProcessingTime: Double
    var dnsQueries: [Int]
    var blockedFiltering: [Int]
    var replacedSafebrowsing: [Int]
    var replacedParental: [Int]
    var topQueriedDomains: KVMap
    var topBlockedDomains: KVMap
    var topClients: KVMap
    var topUpstreamsResponses: KVMap
    var topUpstreamsAvgTime: KVMap

    enum CodingKeys: String, CodingKey {
        case timeUnits = "time_units"
        case numDnsQueries = "num_dns_queries"
        case numBlockedFiltering = "num_blocked_filtering"
        case numReplacedSafebrowsing = "num_replaced_safebrowsing"
        case numReplacedSafesearch = "num_replaced_safesearch"
        case numReplacedParental = "num_replaced_parental"
        case avgProcessingTime = "avg_processing_time"
        case dnsQueries = "dns_queries"
        case blockedFiltering = "blocked_filtering"
        case replacedSafebrowsing = "replaced_safebrowsing"
        case replacedParental = "replaced_parental"
        case topQueriedDomains = "top_queried_domains"
        case topBlockedDomains = "top_blocked_domains"
        case topClients = "top_clients"
        case topUpstreamsResponses = "top_upstreams_responses"
        case topUpstreamsAvgTime = "top_upstreams_avg_time"
    }

    /// 放行数 = 总数 - 各类拦截(对齐 Dashboard.tsx)
    var passedCount: Int {
        max(0, numDnsQueries - numBlockedFiltering - numReplacedSafebrowsing - numReplacedSafesearch - numReplacedParental)
    }
}

// MARK: - /querylog(响应 {data, oldest};elapsedMs 为字符串)

struct QueryLogItem: Codable, Sendable, Equatable, Identifiable {
    struct Question: Codable, Sendable, Equatable {
        var name: String
        var type: String
        var `class`: String?
    }

    struct Answer: Codable, Sendable, Equatable {
        var type: String
        var value: String
        var ttl: Int?
    }

    struct Rule: Codable, Sendable, Equatable {
        var filterListId: Int?
        var text: String

        enum CodingKeys: String, CodingKey {
            case filterListId = "filter_list_id"
            case text
        }
    }

    struct ClientInfo: Codable, Sendable, Equatable {
        var name: String?
        var whois: [String: String]?
        var disallowedRule: String?
        var disallowed: Bool?

        enum CodingKeys: String, CodingKey {
            case name, whois, disallowed
            case disallowedRule = "disallowed_rule"
        }
    }

    var time: String
    var question: Question
    var answer: [Answer]?
    var originalAnswer: [Answer]?
    var status: String?
    var reason: String
    var rules: [Rule]?
    var rule: String?
    var filterId: Int?
    var serviceName: String?
    var client: String
    var clientId: String?
    var clientProto: String?
    var clientInfo: ClientInfo?
    var upstream: String?
    var cached: Bool?
    var answerDnssec: Bool?
    var elapsedMs: String?
    var ecs: String?

    var id: String { time + client + question.name }

    enum CodingKeys: String, CodingKey {
        case time, question, answer, status, reason, rules, rule, client, upstream, cached, ecs
        case originalAnswer = "original_answer"
        case filterId
        case serviceName = "service_name"
        case clientId = "client_id"
        case clientProto = "client_proto"
        case clientInfo = "client_info"
        case answerDnssec = "answer_dnssec"
        case elapsedMs
    }
}

struct QueryLogResponse: Codable, Sendable, Equatable {
    var data: [QueryLogItem]
    var oldest: String?
}

// MARK: - /filtering/status(interval 小时,对齐 Web 版 hoursLabel 直接渲染)

struct Filter: Codable, Sendable, Equatable, Identifiable {
    var url: String
    var name: String
    var id: Int
    var enabled: Bool
    var rulesCount: Int?
    var lastUpdated: String?
    var lastChecked: String?

    enum CodingKeys: String, CodingKey {
        case url, name, id, enabled
        case rulesCount = "rules_count"
        case lastUpdated = "last_updated"
        case lastChecked = "last_checked"
    }
}

struct FilteringStatus: Codable, Sendable, Equatable {
    var enabled: Bool
    var interval: Int
    var filters: [Filter]
    /// v0.107.79 无白名单过滤器时返回 null 而非 [],归一为空数组
    var whitelistFilters: [Filter]
    var userRules: [String]?

    enum CodingKeys: String, CodingKey {
        case enabled, interval, filters
        case whitelistFilters = "whitelist_filters"
        case userRules = "user_rules"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try container.decode(Bool.self, forKey: .enabled)
        interval = try container.decode(Int.self, forKey: .interval)
        filters = try container.decode([Filter].self, forKey: .filters)
        whitelistFilters = try container.decodeIfPresent([Filter].self, forKey: .whitelistFilters) ?? []
        userRules = try container.decodeIfPresent([String].self, forKey: .userRules)
    }
}

// MARK: - /clients

struct AghClient: Codable, Sendable, Equatable, Identifiable {
    var name: String
    var ids: [String]
    var useGlobalSettings: Bool
    var filteringEnabled: Bool?
    var safebrowsingEnabled: Bool?
    var parentalEnabled: Bool?
    var useGlobalBlockedServices: Bool?
    var blockedServices: [String]?
    var tags: [String]?
    var ignoreQuerylog: Bool?
    var ignoreStatistics: Bool?

    var id: String { name }

    enum CodingKeys: String, CodingKey {
        case name, ids, tags
        case useGlobalSettings = "use_global_settings"
        case filteringEnabled = "filtering_enabled"
        case safebrowsingEnabled = "safebrowsing_enabled"
        case parentalEnabled = "parental_enabled"
        case useGlobalBlockedServices = "use_global_blocked_services"
        case blockedServices = "blocked_services"
        case ignoreQuerylog = "ignore_querylog"
        case ignoreStatistics = "ignore_statistics"
    }
}

struct AutoClient: Codable, Sendable, Equatable, Identifiable {
    var ip: String
    var name: String
    var source: String?
    var whoisInfo: [String: String]?

    var id: String { ip }

    enum CodingKeys: String, CodingKey {
        case ip, name, source
        case whoisInfo = "whois_info"
    }
}

struct ClientsData: Codable, Sendable, Equatable {
    var clients: [AghClient]?
    var autoClients: [AutoClient]?

    enum CodingKeys: String, CodingKey {
        case clients
        case autoClients = "auto_clients"
    }

    var totalCount: Int { (clients?.count ?? 0) + (autoClients?.count ?? 0) }
}

// MARK: - 其余端点类型(设置/过滤器/重写/服务目录/DHCP/TLS)

struct DnsInfo: Codable, Sendable, Equatable {
    var upstreamDns: [String]
    var bootstrapDns: [String]
    var fallbackDns: [String]
    var protectionEnabled: Bool
    var protectionDisabledUntil: String?
    var ratelimit: Int?
    var ratelimitWhitelist: [String]?
    var upstreamTimeout: Int?
    var upstreamMode: String?
    var blockingMode: String?
    var blockingIpv4: String?
    var blockingIpv6: String?
    var blockedResponseTtl: Int?
    var ednsCsEnabled: Bool?
    var ednsCsUseCustom: Bool?
    var ednsCsCustomIp: String?
    var disableIpv6: Bool?
    var dnssecEnabled: Bool?
    var cacheEnabled: Bool?
    var cacheSize: Int?
    var cacheTtlMin: Int?
    var cacheTtlMax: Int?
    var cacheOptimistic: Bool?
    var usePrivatePtrResolvers: Bool?
    var resolveClients: Bool?
    var localPtrUpstreams: [String]?

    enum CodingKeys: String, CodingKey {
        case ratelimit
        case upstreamDns = "upstream_dns"
        case bootstrapDns = "bootstrap_dns"
        case fallbackDns = "fallback_dns"
        case protectionEnabled = "protection_enabled"
        case protectionDisabledUntil = "protection_disabled_until"
        case ratelimitWhitelist = "ratelimit_whitelist"
        case upstreamTimeout = "upstream_timeout"
        case upstreamMode = "upstream_mode"
        case blockingMode = "blocking_mode"
        case blockingIpv4 = "blocking_ipv4"
        case blockingIpv6 = "blocking_ipv6"
        case blockedResponseTtl = "blocked_response_ttl"
        case ednsCsEnabled = "edns_cs_enabled"
        case ednsCsUseCustom = "edns_cs_use_custom"
        case ednsCsCustomIp = "edns_cs_custom_ip"
        case disableIpv6 = "disable_ipv6"
        case dnssecEnabled = "dnssec_enabled"
        case cacheEnabled = "cache_enabled"
        case cacheSize = "cache_size"
        case cacheTtlMin = "cache_ttl_min"
        case cacheTtlMax = "cache_ttl_max"
        case cacheOptimistic = "cache_optimistic"
        case usePrivatePtrResolvers = "use_private_ptr_resolvers"
        case resolveClients = "resolve_clients"
        case localPtrUpstreams = "local_ptr_upstreams"
    }
}

struct TlsStatus: Codable, Sendable, Equatable {
    var enabled: Bool
    var serverName: String?
    var forceHttps: Bool?
    var servePlainDns: Bool?
    var portHttps: Int?
    var portDnsOverTls: Int?
    var portDnsOverQuic: Int?
    var subject: String?
    var issuer: String?
    var notBefore: String?
    var notAfter: String?
    var validCert: Bool?
    var validChain: Bool?
    var validKey: Bool?
    var validPair: Bool?
    var warningValidation: String?

    enum CodingKeys: String, CodingKey {
        case enabled, subject, issuer
        case serverName = "server_name"
        case forceHttps = "force_https"
        case servePlainDns = "serve_plain_dns"
        case portHttps = "port_https"
        case portDnsOverTls = "port_dns_over_tls"
        case portDnsOverQuic = "port_dns_over_quic"
        case notBefore = "not_before"
        case notAfter = "not_after"
        case validCert = "valid_cert"
        case validChain = "valid_chain"
        case validKey = "valid_key"
        case validPair = "valid_pair"
        case warningValidation = "warning_validation"
    }
}

struct RewriteEntry: Codable, Sendable, Equatable, Identifiable {
    var domain: String
    var answer: String
    var enabled: Bool?

    var id: String { domain + "->" + answer }
}

/// v0.107.79 /rewrite/list 直接返回数组,旧版返回 {servers:[...]};两种形态都接受
struct RewriteList: Codable, Sendable, Equatable {
    var servers: [RewriteEntry]?

    init(servers: [RewriteEntry]? = nil) { self.servers = servers }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let list = try? container.decode([RewriteEntry].self) {
            servers = list
        } else {
            servers = try container.decode(Body.self).servers
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(servers ?? [])
    }

    private struct Body: Codable {
        var servers: [RewriteEntry]?
    }
}

struct BlockedService: Codable, Sendable, Equatable, Identifiable {
    var id: String
    var name: String
    var iconSvg: String?
    var rules: [String]?
    var groupId: String?

    enum CodingKeys: String, CodingKey {
        case id, name, rules
        case iconSvg = "icon_svg"
        case groupId = "group_id"
    }
}

struct BlockedServicesState: Codable, Sendable, Equatable {
    var ids: [String]
    var schedule: BlockedServicesSchedule?
}

struct BlockedServicesSchedule: Codable, Sendable, Equatable {
    var timeZone: String?
    var entries: [String]?

    enum CodingKeys: String, CodingKey {
        case timeZone = "time_zone"
        case entries
    }
}

struct DhcpStatus: Codable, Sendable, Equatable {
    struct V4: Codable, Sendable, Equatable {
        var gatewayIp: String?
        var subnetMask: String?
        var rangeStart: String?
        var rangeEnd: String?
        var leaseDuration: Int?

        enum CodingKeys: String, CodingKey {
            case gatewayIp = "gateway_ip"
            case subnetMask = "subnet_mask"
            case rangeStart = "range_start"
            case rangeEnd = "range_end"
            case leaseDuration = "lease_duration"
        }
    }

    struct Lease: Codable, Sendable, Equatable {
        var mac: String
        var ip: String
        var hostname: String
        var expires: String?
    }

    var enabled: Bool
    var interfaceName: String?
    var v4: V4?
    var leases: [Lease]?
    var staticLeases: [Lease]?

    enum CodingKeys: String, CodingKey {
        case enabled, leases
        case interfaceName = "interface_name"
        case v4
        case staticLeases = "static_leases"
    }
}

struct LogConfig: Codable, Sendable, Equatable {
    var enabled: Bool
    /// 毫秒
    var interval: Int
    var anonymizeClientIp: Bool?
    var ignored: [String]?
    var ignoredEnabled: Bool?

    enum CodingKeys: String, CodingKey {
        case enabled, interval, ignored
        case anonymizeClientIp = "anonymize_client_ip"
        case ignoredEnabled = "ignored_enabled"
    }
}

struct VersionInfo: Codable, Sendable, Equatable {
    var disabled: Bool
    var newVersion: String?
    var announcement: String?
    var announcementUrl: String?
    var canAutoupdate: Bool?

    enum CodingKeys: String, CodingKey {
        case disabled, announcement
        case newVersion = "new_version"
        case announcementUrl = "announcement_url"
        case canAutoupdate = "can_autoupdate"
    }
}

/// safebrowsing/parental 等单开关状态端点
struct SimpleToggleStatus: Codable, Sendable, Equatable {
    var enabled: Bool
}

// MARK: - reason 元数据(对照 constants.ts REASON_META)

enum ReasonKind: Sendable {
    case blocked
    case ok
    case rewrite
    case warn
}

struct ReasonMeta: Sendable {
    let label: String
    let kind: ReasonKind
}

enum Reason {
    static let meta: [String: ReasonMeta] = [
        "FilteredBlackList": ReasonMeta(label: "黑名单", kind: .blocked),
        "FilteredBlockedService": ReasonMeta(label: "服务拦截", kind: .blocked),
        "FilteredSafeBrowsing": ReasonMeta(label: "安全浏览", kind: .blocked),
        "FilteredParental": ReasonMeta(label: "家长控制", kind: .blocked),
        "FilteredInvalid": ReasonMeta(label: "无效请求", kind: .warn),
        "FilteredSafeSearch": ReasonMeta(label: "安全搜索", kind: .rewrite),
        "NotFilteredWhiteList": ReasonMeta(label: "白名单", kind: .ok),
        "NotFilteredNotFound": ReasonMeta(label: "已放行", kind: .ok),
        "NotFilteredError": ReasonMeta(label: "上游错误", kind: .warn),
        "Rewrite": ReasonMeta(label: "重写", kind: .rewrite),
        "RewriteEtcHosts": ReasonMeta(label: "系统 Hosts", kind: .rewrite),
        "RewriteRule": ReasonMeta(label: "重写规则", kind: .rewrite),
    ]

    static func label(_ reason: String) -> String { meta[reason]?.label ?? reason }
    static func kind(_ reason: String) -> ReasonKind { meta[reason]?.kind ?? .ok }
}

// MARK: - 日志筛选(对照 constants.ts LOG_FILTERS)

struct LogFilter: Sendable, Identifiable {
    let key: String
    let label: String
    let reasons: [String]

    var id: String { key }
}

enum LogFilters {
    static let all = [
        LogFilter(key: "all", label: "全部", reasons: []),
        LogFilter(key: "blocked", label: "已拦截", reasons: ["FilteredBlackList", "FilteredBlockedService", "FilteredSafeBrowsing", "FilteredParental", "FilteredInvalid"]),
        LogFilter(key: "allowed", label: "已放行", reasons: ["NotFilteredNotFound", "NotFilteredError"]),
        LogFilter(key: "whitelist", label: "白名单", reasons: ["NotFilteredWhiteList"]),
        LogFilter(key: "rewritten", label: "重写", reasons: ["Rewrite", "RewriteEtcHosts", "RewriteRule", "FilteredSafeSearch"]),
    ]
}
