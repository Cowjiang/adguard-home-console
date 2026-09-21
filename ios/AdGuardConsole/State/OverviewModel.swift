import Foundation
import Observation

enum TrendRange: Int, CaseIterable, Identifiable {
    case h6 = 6
    case h12 = 12
    case h24 = 24

    var id: Int { rawValue }
    var label: String { "\(rawValue) 小时" }
}

struct TrendPoint: Identifiable, Equatable {
    let index: Int
    let date: Date
    let queries: Int
    let blocked: Int

    var id: Int { index }
}

/// 概览页数据:stats 5s 轮询、clients 60s;后台暂停,回前台立即刷新(IOS_NATIVE_PLAN §2)
@MainActor
@Observable
final class OverviewModel {
    var stats: AGHStats?
    var clients: ClientsData?
    var statsError: String?
    var loading = true
    var trendRange: TrendRange = .h24

    private var pollTask: Task<Void, Never>?
    private var api: APIClient?
    private var lastClientsFetch: Date?
    private var lastCfg: SvrConfig?

    func start(session: AppSession) {
        guard let cfg = session.cfg else { return }
        if lastCfg != cfg {
            api = APIClient(cfg: cfg)
            lastCfg = cfg
        }
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.tick()
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
    }

    func refreshNow() async {
        await tick()
    }

    private func tick() async {
        guard let api else { return }
        do {
            let s = try await api.getStats()
            stats = s
            statsError = nil
        } catch {
            statsError = error.localizedDescription
        }
        loading = false
        let stale: Bool
        if let last = lastClientsFetch {
            stale = Date().timeIntervalSince(last) > 60
        } else {
            stale = true
        }
        if stale { await fetchClients() }
    }

    private func fetchClients() async {
        guard let api else { return }
        do {
            clients = try await api.getClients()
            lastClientsFetch = Date()
        } catch {
            // 客户端数据失败不阻塞统计展示
        }
    }

    // MARK: 派生数据

    func clientName(_ ip: String) -> String {
        if let c = clients?.clients?.first(where: { $0.ids.contains(ip) }) { return c.name }
        if let a = clients?.autoClients?.first(where: { $0.ip == ip }) { return a.name }
        return ip
    }

    var trendPoints: [TrendPoint] {
        guard let stats else { return [] }
        let queries = Array(stats.dnsQueries.suffix(trendRange.rawValue))
        let blocked = Array(stats.blockedFiltering.suffix(trendRange.rawValue))
        let count = min(queries.count, blocked.count)
        guard count > 0 else { return [] }
        let now = Date()
        return (0..<count).map { i in
            let date = Calendar.current.date(byAdding: .hour, value: -(count - 1 - i), to: now) ?? now
            return TrendPoint(index: i, date: date, queries: queries[i], blocked: blocked[i])
        }
    }

    var blockedPct: String {
        guard let stats else { return "0%" }
        return Fmt.pct(stats.numBlockedFiltering, stats.numDnsQueries)
    }

    var topQueried: [KVPair] {
        sortedTop(stats?.topQueriedDomains)
    }

    var topQueriedAll: [KVPair] {
        sortedTop(stats?.topQueriedDomains, limit: 25)
    }

    var topBlocked: [KVPair] {
        sortedTop(stats?.topBlockedDomains)
    }

    var topBlockedAll: [KVPair] {
        sortedTop(stats?.topBlockedDomains, limit: 25)
    }

    var topClients: [(name: String, value: Double)] {
        sortedTop(stats?.topClients).map { (clientName($0.key), $0.value) }
    }

    var topClientsAll: [(name: String, value: Double)] {
        sortedTop(stats?.topClients, limit: 25).map { (clientName($0.key), $0.value) }
    }

    var upstreams: [(url: String, count: Double, avgSec: Double?)] {
        let responses = sortedTop(stats?.topUpstreamsResponses)
        let avgMap = stats?.topUpstreamsAvgTime.asDictionary ?? [:]
        return responses.prefix(6).map { (url: $0.key, count: $0.value, avgSec: avgMap[$0.key]) }
    }

    private func sortedTop(_ map: KVMap?, limit: Int = 10) -> [KVPair] {
        guard let map else { return [] }
        return map.entries.sorted { $0.value > $1.value }.prefix(limit).map { $0 }
    }

    /// 请求构成五段(对齐 Dashboard.tsx Donut)
    var donutSegments: [DonutSegment] {
        guard let stats else { return [] }
        return [
            DonutSegment(label: "正常放行", value: stats.passedCount, color: .agAccent),
            DonutSegment(label: "已拦截", value: stats.numBlockedFiltering, color: .agDanger),
            DonutSegment(label: "安全浏览", value: stats.numReplacedSafebrowsing, color: .agWarn),
            DonutSegment(label: "安全搜索", value: stats.numReplacedSafesearch, color: .agInfo),
            DonutSegment(label: "家长控制", value: stats.numReplacedParental, color: .agViolet),
        ]
    }
}
