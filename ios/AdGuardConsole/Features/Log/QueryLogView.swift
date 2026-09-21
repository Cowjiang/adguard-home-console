import SwiftUI

/// 日志 tab(N5 前的基础版):2s 实时滚动、LOG_FILTERS 筛选、搜索、详情 Sheet
@MainActor
@Observable
final class QueryLogModel {
    var items: [QueryLogItem] = []
    var filterKey = "all" { didSet { restart() } }
    var searchText = "" { didSet { if oldValue != searchText { restartDebounced() } } }
    var errorText: String?
    var loading = true
    var paused = false

    private var pollTask: Task<Void, Never>?
    private var api: APIClient?
    private var lastCfg: SvrConfig?
    private var debounceTask: Task<Void, Never>?

    var currentFilter: LogFilter? {
        LogFilters.all.first { $0.key == filterKey }
    }

    func start(session: AppSession) {
        paused = false
        guard let cfg = session.cfg else { return }
        if lastCfg != cfg {
            api = APIClient(cfg: cfg)
            lastCfg = cfg
            restart()
        }
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                if Task.isCancelled { break }
                await self?.tick()
            }
        }
    }

    func stop(markPaused: Bool = true) {
        pollTask?.cancel()
        pollTask = nil
        if markPaused { paused = true }
    }

    func togglePaused(session: AppSession) {
        if paused {
            start(session: session)
        } else {
            stop()
        }
    }

    func refreshNow() async {
        await tick()
    }

    private func restart() {
        items = []
        loading = true
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled else { return }
            await self?.tick()
        }
    }

    private func restartDebounced() {
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            self?.items = []
            self?.loading = true
            await self?.tick()
        }
    }

    private func tick() async {
        guard let api else { return }
        do {
            let response = try await api.queryLog(
                search: searchText.isEmpty ? nil : searchText,
                reasons: currentFilter?.reasons ?? [],
                limit: 100
            )
            // 实时滚动合并:接口按时间倒序返回,直接替换(Web 版同思路,旧数据靠 older_than 回溯,本轮不做)
            items = response.data
            errorText = nil
        } catch {
            errorText = error.localizedDescription
        }
        loading = false
    }
}

struct QueryLogView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var model = QueryLogModel()
    @State private var detailItem: QueryLogItem?

    var body: some View {
        NavigationStack {
            Group {
                if model.loading, model.items.isEmpty, model.errorText == nil {
                    ProgressView("加载日志…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    list
                }
            }
            .navigationTitle("日志")
            .background(Color.agBg)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        model.togglePaused(session: session)
                    } label: {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(model.paused ? Color.secondary : Color.agOk)
                                .frame(width: 5, height: 5)
                            Text(model.paused ? "已暂停" : "实时")
                                .font(.caption.weight(.medium))
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill((model.paused ? Color.secondary : Color.agOk).opacity(0.14)))
                        .foregroundStyle(model.paused ? Color.secondary : Color.agOk)
                    }
                }
            }
            .searchable(text: $model.searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "域名或客户端")
            .refreshable { await model.refreshNow() }
        }
        .onAppear { model.start(session: session) }
        .onDisappear { model.stop() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task {
                    await model.refreshNow()
                    model.start(session: session)
                }
            } else {
                model.stop()
            }
        }
    }

    private var list: some View {
        List {
            Section {
                AGSegmented(
                    options: LogFilters.all.map { ($0.label, $0.key) },
                    selection: $model.filterKey
                )
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }
            if let error = model.errorText {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(Color.agDanger)
                }
            }
            Section {
                if model.items.isEmpty {
                    Text("没有匹配的日志")
                        .font(.footnote)
                        .foregroundStyle(.tertiary)
                        .frame(maxWidth: .infinity, alignment: .center)
                } else {
                    ForEach(Array(model.items.enumerated()), id: \.element.id) { _, item in
                        Button {
                            detailItem = item
                        } label: {
                            LogRow(item: item)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 3, leading: 16, bottom: 3, trailing: 16))
                    }
                }
            } header: {
                Text("最近 \(model.items.count) 条 · 每 2 秒刷新")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.agBg)
        .sheet(item: $detailItem) { item in
            LogDetailSheet(item: item)
                .presentationDetents([.medium, .large])
        }
    }
}

struct LogRow: View {
    let item: QueryLogItem

    private var qtypeColor: Color { Color.qtype(item.question.type) }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Capsule()
                .fill(qtypeColor)
                .frame(width: 3)
                .padding(.vertical, 2)
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(item.question.name)
                            .font(.footnote.weight(.medium))
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Text(item.question.type)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(qtypeColor)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(qtypeColor.opacity(0.14)))
                        if item.cached == true {
                            Text("缓存")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Capsule().fill(Color.secondary.opacity(0.12)))
                        }
                    }
                    HStack(spacing: 5) {
                        Text(Fmt.clock(Fmt.parseISO(item.time) ?? Date()))
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.tertiary)
                        Text(item.clientInfo?.name?.isEmpty == false ? (item.clientInfo?.name ?? item.client) : item.client)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        if let elapsed = item.elapsedMs, let ms = Double(elapsed) {
                            Text(Fmt.ms(ms / 1000))
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
                Spacer(minLength: 6)
                ReasonBadge(reason: item.reason)
            }
            .padding(.leading, 10)
            .padding(10)
        }
        .agCard(cornerRadius: 16)
        .contentShape(Rectangle())
    }
}

struct ReasonBadge: View {
    let reason: String

    private var color: Color {
        switch Reason.kind(reason) {
        case .blocked: return .agDanger
        case .ok: return .agOk
        case .rewrite: return .agViolet
        case .warn: return .agWarn
        }
    }

    var body: some View {
        Text(Reason.label(reason))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.14))
            .clipShape(Capsule())
    }
}

struct LogDetailSheet: View {
    let item: QueryLogItem
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("请求") {
                    detailRow("域名", item.question.name)
                    detailRow("类型", "\(item.question.type) / \(item.question.class ?? "IN")")
                    detailRow("时间", item.time)
                    detailRow("客户端", clientText)
                    if let proto = item.clientProto { detailRow("协议", proto) }
                    if let ecs = item.ecs, !ecs.isEmpty { detailRow("ECS", ecs) }
                }
                Section("结果") {
                    detailRow("原因", Reason.label(item.reason))
                    if let rule = item.rule, !rule.isEmpty { detailRow("命中规则", rule) }
                    if let serviceName = item.serviceName, !serviceName.isEmpty { detailRow("服务", serviceName) }
                    detailRow("缓存", (item.cached ?? false) ? "命中" : "未命中")
                    if let dnssec = item.answerDnssec, dnssec { detailRow("DNSSEC", "已校验") }
                    if let elapsed = item.elapsedMs, let ms = Double(elapsed) {
                        detailRow("耗时", String(format: "%.1f ms", ms))
                    }
                    if let upstream = item.upstream, !upstream.isEmpty { detailRow("上游", upstream) }
                }
                if let answers = item.answer, !answers.isEmpty {
                    Section("应答") {
                        ForEach(Array(answers.enumerated()), id: \.offset) { _, answer in
                            detailRow(answer.type, answer.value)
                        }
                    }
                }
            }
            .navigationTitle(item.question.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("完成") { dismiss() }
                }
            }
        }
    }

    private var clientText: String {
        let name = item.clientInfo?.name ?? ""
        return name.isEmpty ? item.client : "\(name)(\(item.client))"
    }

    private func detailRow(_ title: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value)
                .font(.footnote.monospaced())
                .multilineTextAlignment(.trailing)
                .textSelection(.enabled)
        }
        .padding(.vertical, 1)
    }
}
