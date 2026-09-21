import Foundation

// MARK: - 错误语义对齐 Web 版 ApiError(auth.tsx:401/403 → "用户名或密码错误")

enum APIError: Error, LocalizedError {
    case invalidURL
    case http(status: Int, message: String)
    case timeout
    case network(String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "无效的服务器地址"
        case .http(let status, let message):
            if status == 401 || status == 403 { return "用户名或密码错误" }
            return message.isEmpty ? "HTTP \(status)" : message
        case .timeout:
            return "连接超时,请检查地址与网络"
        case .network(let message):
            return message
        case .decoding(let message):
            return "数据解析失败:\(message)"
        }
    }
}

// MARK: - API 客户端:URLSession 直连 <cfg.url>/control/*,Basic Auth,无代理

struct APIClient: Sendable {
    let cfg: SvrConfig

    /// 一般请求超时;/filtering/refresh 等长任务用 120(R7)
    static let defaultTimeout: TimeInterval = 15
    static let longTaskTimeout: TimeInterval = 120

    var baseURL: URL? {
        var trimmed = cfg.url.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        guard trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://"), let url = URL(string: trimmed) else { return nil }
        return url.appendingPathComponent("control")
    }

    // MARK: 底层请求

    /// 发送请求并返回解析后的 JSON;错误语义与 server/index.mjs 代理对齐
    func send(_ path: String, method: String = "GET", query: [URLQueryItem] = [], body: (any Encodable)? = nil, timeout: TimeInterval = APIClient.defaultTimeout) async throws -> (data: Data, httpStatus: Int) {
        guard let base = baseURL else { throw APIError.invalidURL }
        var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        guard let url = components?.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = timeout
        let credential = "\(cfg.username):\(cfg.password)"
        request.setValue("Basic \(Data(credential.utf8).base64EncodedString())", forHTTPHeaderField: "Authorization")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch let error as URLError where error.code == .timedOut {
            throw APIError.timeout
        } catch {
            throw APIError.network(error.localizedDescription)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if !(200...299).contains(status) {
            throw APIError.http(status: status, message: Self.errorMessage(from: data))
        }
        return (data, status)
    }

    func get<T: Decodable>(_ type: T.Type, _ path: String, query: [URLQueryItem] = [], timeout: TimeInterval = APIClient.defaultTimeout) async throws -> T {
        let (data, _) = try await send(path, query: query, timeout: timeout)
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding(String(describing: error)) }
    }

    func post(_ path: String, body: (any Encodable)? = nil, timeout: TimeInterval = APIClient.defaultTimeout) async throws {
        _ = try await send(path, method: "POST", body: body, timeout: timeout)
    }

    func put(_ path: String, body: (any Encodable)? = nil, timeout: TimeInterval = APIClient.defaultTimeout) async throws {
        _ = try await send(path, method: "PUT", body: body, timeout: timeout)
    }

    /// 从错误响应里取 error/message 字段(Web 版同名逻辑)
    static func errorMessage(from data: Data) -> String {
        struct APIErrorMessage: Decodable { let error: String?; let message: String? }
        if let parsed = try? JSONDecoder().decode(APIErrorMessage.self, from: data) {
            return parsed.error ?? parsed.message ?? ""
        }
        let text = String(data: data.prefix(200), encoding: .utf8) ?? ""
        return text
    }

    // MARK: 具体端点

    func getStatus() async throws -> AGHStatus {
        try await get(AGHStatus.self, "status")
    }

    func getStats() async throws -> AGHStats {
        try await get(AGHStats.self, "stats")
    }

    func getClients() async throws -> ClientsData {
        try await get(ClientsData.self, "clients")
    }

    func getFilteringStatus() async throws -> FilteringStatus {
        try await get(FilteringStatus.self, "filtering/status")
    }

    func setFiltering(enabled: Bool) async throws {
        try await put("filtering/config", body: ["enabled": enabled])
    }

    /// protection:POST {enabled, duration(ms)}(PROJECT_MEMORY §3:set_protection 不存在)
    func setProtection(enabled: Bool, durationMs: Int) async throws {
        try await post("protection", body: ProtectionBody(enabled: enabled, duration: durationMs))
    }

    private struct ProtectionBody: Encodable {
        let enabled: Bool
        let duration: Int
    }

    func getSafeBrowsing() async throws -> SimpleToggleStatus {
        try await get(SimpleToggleStatus.self, "safebrowsing/status")
    }

    func setSafeBrowsing(enabled: Bool) async throws {
        try await post("safebrowsing/update", body: ["enabled": enabled])
    }

    func getParental() async throws -> SimpleToggleStatus {
        try await get(SimpleToggleStatus.self, "parental/status")
    }

    func setParental(enabled: Bool) async throws {
        try await post("parental/update", body: ["enabled": enabled])
    }

    /// querylog:search / reason[](可重复)/ older_than / offset / limit
    func queryLog(search: String? = nil, reasons: [String] = [], olderThan: String? = nil, offset: Int = 0, limit: Int = 300) async throws -> QueryLogResponse {
        var query: [URLQueryItem] = [URLQueryItem(name: "limit", value: String(limit))]
        if let search, !search.isEmpty { query.append(URLQueryItem(name: "search", value: search)) }
        for reason in reasons { query.append(URLQueryItem(name: "reason", value: reason)) }
        if let olderThan, !olderThan.isEmpty { query.append(URLQueryItem(name: "older_than", value: olderThan)) }
        if offset > 0 { query.append(URLQueryItem(name: "offset", value: String(offset))) }
        return try await get(QueryLogResponse.self, "querylog", query: query)
    }
}
