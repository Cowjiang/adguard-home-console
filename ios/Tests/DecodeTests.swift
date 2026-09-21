import XCTest
@testable import AdGuardConsole

/// 解码夹具测试:对照 mock v0.107.79 响应(自建夹具,原 _probe/ 不在本仓库)
final class DecodeTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let url = Bundle(for: DecodeTests.self)
            .url(forResource: name, withExtension: "json")
        let unwrapped = try XCTUnwrap(url, "夹具 \(name).json 不在测试包内")
        return try Data(contentsOf: unwrapped)
    }

    // MARK: /status(毫秒单位字段)

    func testStatusDecode() throws {
        let data = try fixture("status")
        let status = try JSONDecoder().decode(AGHStatus.self, from: data)
        XCTAssertEqual(status.version, "0.107.79")
        XCTAssertTrue(status.protectionEnabled)
        XCTAssertEqual(status.protectionDisabledDuration, 0)
        XCTAssertEqual(status.dnsPort, 53)
        XCTAssertTrue(status.running)
        XCTAssertEqual(status.startTime, 1_758_430_000_000)
        XCTAssertNil(status.protectionDisabledUntil)
    }

    func testStatusPausedDecode() throws {
        let data = try fixture("status_paused")
        let status = try JSONDecoder().decode(AGHStatus.self, from: data)
        XCTAssertFalse(status.protectionEnabled)
        XCTAssertEqual(status.protectionDisabledDuration, 1_800_000, "protection_disabled_duration 单位是毫秒")
        XCTAssertEqual(status.protectionDisabledUntil, "2026-09-21T12:30:00.000Z")
    }

    func testISODateParsing() {
        XCTAssertNotNil(Fmt.parseISO("2026-09-21T12:30:00.000Z"), "带毫秒的 RFC3339")
        XCTAssertNotNil(Fmt.parseISO("2026-09-21T12:30:00Z"), "不带毫秒的 RFC3339")
    }

    // MARK: KVMap 双形态

    func testKVMapArrayFormKeepsOrder() throws {
        let stats = try JSONDecoder().decode(AGHStats.self, from: try fixture("stats"))
        let entries = stats.topQueriedDomains.entries
        XCTAssertEqual(entries.count, 5)
        XCTAssertEqual(entries.first?.key, "www.google.com", "数组形态按原始顺序保留")
        XCTAssertEqual(entries[0].value, 923)
        XCTAssertEqual(entries.last?.key, "www.apple.com")
    }

    func testKVMapDictFormSortedByValue() throws {
        let stats = try JSONDecoder().decode(AGHStats.self, from: try fixture("stats_dict"))
        let entries = stats.topQueriedDomains.entries
        XCTAssertEqual(Set(entries.map(\.key)), Set(["a.com", "b.com", "c.com"]))
        XCTAssertEqual(entries.first?.key, "a.com", "字典形态无序,按值降序归一")
        XCTAssertEqual(entries.first?.value, 50)
    }

    func testStatsDecodeUnitsAndArrays() throws {
        let stats = try JSONDecoder().decode(AGHStats.self, from: try fixture("stats"))
        XCTAssertEqual(stats.dnsQueries.count, 24, "v0.107.79 内嵌 24 小时序列(oldest→newest)")
        XCTAssertEqual(stats.numDnsQueries, 12_345)
        XCTAssertEqual(stats.avgProcessingTime, 0.0234, accuracy: 0.0001, "avg_processing_time 是秒(浮点),不是毫秒")
        let avg = stats.topUpstreamsAvgTime.asDictionary
        XCTAssertEqual(avg["223.5.5.5:53"] ?? -1, 0.0092, accuracy: 0.0001, "top_upstreams_avg_time 也是秒")
        XCTAssertEqual(stats.passedCount, 12345 - 1234 - 17 - 9 - 4)
    }

    // MARK: /querylog(reason 字符串枚举、可选字段)

    func testQueryLogDecode() throws {
        let response = try JSONDecoder().decode(QueryLogResponse.self, from: try fixture("querylog"))
        XCTAssertEqual(response.data.count, 3)
        XCTAssertEqual(response.oldest, "2026-09-21T03:09:00.000Z")

        let blocked = response.data[0]
        XCTAssertEqual(blocked.reason, "FilteredBlackList")
        XCTAssertEqual(blocked.rules?.first?.filterListId, 1)
        XCTAssertEqual(blocked.filterId, 1, "filterId 是驼峰键")
        XCTAssertEqual(blocked.elapsedMs, "12.3456", "elapsedMs 是字符串")
        XCTAssertEqual(blocked.clientInfo?.name, "iPhone-15")

        let allowed = response.data[1]
        XCTAssertEqual(allowed.reason, "NotFilteredNotFound")
        XCTAssertEqual(allowed.answer?.first?.ttl, 1800)
        XCTAssertEqual(allowed.ecs, "116.24.0.0/16")
        XCTAssertTrue(allowed.cached == true)

        let rewritten = response.data[2]
        XCTAssertEqual(rewritten.reason, "Rewrite")
        XCTAssertEqual(rewritten.serviceName, "youtube")

        XCTAssertEqual(Reason.label("FilteredBlackList"), "黑名单")
        XCTAssertEqual(Reason.kind("RewriteRule"), .rewrite)
        XCTAssertEqual(Reason.label("UnknownReason"), "UnknownReason", "未知 reason 回退原串,不崩")
    }

    // MARK: /filtering/status(interval 小时)

    func testFilteringStatusDecode() throws {
        let status = try JSONDecoder().decode(FilteringStatus.self, from: try fixture("filtering_status"))
        XCTAssertTrue(status.enabled)
        XCTAssertEqual(status.interval, 24, "filtering interval 单位是小时(AGH FiltersUpdateIntervalHours,对齐 Web 版)")
        XCTAssertEqual(status.filters.count, 1)
        XCTAssertEqual(status.filters[0].rulesCount, 50_123)
        XCTAssertEqual(status.whitelistFilters.count, 1)
        XCTAssertEqual(status.userRules, ["@@||cn.bing.com^$important"])
    }

    // MARK: 真实 v0.107.79 响应回归(实测 100.76.99.57,真机"数据解析失败"复现载荷)

    func testStatusRealFloatStartTime() throws {
        // 真实 AGH 的 start_time 带小数(毫秒含亚毫秒精度),Int64 会抛
        // "Number ... is not representable in Swift",必须用 Double 承接
        let json = #"{"version":"v0.107.79","language":"","dns_addresses":["127.0.0.1","::1"],"dns_port":53,"http_port":3000,"protection_disabled_duration":0,"start_time":1789897891068.7437,"protection_enabled":true,"dhcp_available":true,"running":true}"#
        let status = try JSONDecoder().decode(AGHStatus.self, from: Data(json.utf8))
        XCTAssertEqual(status.version, "v0.107.79")
        XCTAssertEqual(status.startTime, 1_789_897_891_068.7437, accuracy: 0.001)
        XCTAssertTrue(status.protectionEnabled)
        XCTAssertNil(status.protectionDisabledUntil)
    }

    func testFilteringStatusRealNullWhitelist() throws {
        // 真实 AGH 无白名单过滤器时 whitelist_filters 返回 null(而非 []),归一为空数组
        let json = #"{"filters":[{"url":"https://anti-ad.net/adguard.txt","name":"anti-AD","last_updated":"2026-09-20T18:09:18Z","id":1789809535,"rules_count":100173,"enabled":true}],"whitelist_filters":null,"user_rules":["||data.bilibili.com^"],"interval":12,"enabled":true}"#
        let status = try JSONDecoder().decode(FilteringStatus.self, from: Data(json.utf8))
        XCTAssertEqual(status.filters.count, 1)
        XCTAssertTrue(status.whitelistFilters.isEmpty)
        XCTAssertEqual(status.userRules, ["||data.bilibili.com^"])
        XCTAssertEqual(status.interval, 12)
    }

    func testRewriteListBareArray() throws {
        // v0.107.79 /rewrite/list 返回裸数组,旧版返回 {servers:[...]}
        let bare = try JSONDecoder().decode(RewriteList.self, from: Data(#"[]"#.utf8))
        XCTAssertTrue(bare.servers?.isEmpty ?? true)
        let wrapped = try JSONDecoder().decode(
            RewriteList.self,
            from: Data(#"{"servers":[{"domain":"a.com","answer":"1.2.3.4","enabled":true}]}"#.utf8)
        )
        XCTAssertEqual(wrapped.servers?.count, 1)
        XCTAssertEqual(wrapped.servers?.first?.domain, "a.com")
    }

    // MARK: /clients

    func testClientsDecode() throws {
        let clients = try JSONDecoder().decode(ClientsData.self, from: try fixture("clients"))
        XCTAssertEqual(clients.clients?.count, 1)
        XCTAssertEqual(clients.autoClients?.count, 2)
        XCTAssertEqual(clients.totalCount, 3)
        XCTAssertEqual(clients.clients?.first?.name, "Cindy-MacBook")
        XCTAssertEqual(clients.autoClients?.first?.ip, "192.168.1.51")
    }

    // MARK: 错误语义(对齐 Web 版 ApiError)

    func testErrorMessageMapping() {
        let errorData = Data(#"{"error":"Unauthorized"}"#.utf8)
        XCTAssertEqual(APIClient.errorMessage(from: errorData), "Unauthorized")

        let apiError = APIError.http(status: 401, message: "Unauthorized")
        XCTAssertEqual(apiError.errorDescription, "用户名或密码错误")
        let forbidden = APIError.http(status: 403, message: "")
        XCTAssertEqual(forbidden.errorDescription, "用户名或密码错误")
        XCTAssertEqual(APIError.timeout.errorDescription, "连接超时,请检查地址与网络")
    }
}
