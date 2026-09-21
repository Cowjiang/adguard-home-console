import SwiftUI

/// 过滤器 tab(N4 前的基础版):过滤列表/白名单/自定义规则概览,启停开关可用
@MainActor
@Observable
final class FiltersModel {
    var status: FilteringStatus?
    var safeBrowsing = false
    var parental = false
    var errorText: String?
    var loading = true
    var busyFilterId: Int?

    private var api: APIClient?
    private var lastCfg: SvrConfig?

    func refresh(session: AppSession) async {
        guard let cfg = session.cfg else { return }
        if lastCfg != cfg {
            api = APIClient(cfg: cfg)
            lastCfg = cfg
        }
        do {
            status = try await api?.getFilteringStatus()
            errorText = nil
        } catch {
            errorText = error.localizedDescription
        }
        // 安全防护开关(失败容忍,不阻塞主列表)
        if let sb = try? await api?.getSafeBrowsing() { safeBrowsing = sb.enabled }
        if let p = try? await api?.getParental() { parental = p.enabled }
        loading = false
    }

    func setEnabled(_ enabled: Bool, session: AppSession) async {
        guard let api else { return }
        busyFilterId = -1
        defer { busyFilterId = nil }
        do {
            try await api.setFiltering(enabled: enabled)
            await refresh(session: session)
        } catch {
            errorText = error.localizedDescription
        }
    }

    func setSafeBrowsing(_ enabled: Bool) async {
        guard let api else { return }
        do {
            try await api.setSafeBrowsing(enabled: enabled)
            safeBrowsing = enabled
        } catch {
            errorText = error.localizedDescription
        }
    }

    func setParental(_ enabled: Bool) async {
        guard let api else { return }
        do {
            try await api.setParental(enabled: enabled)
            parental = enabled
        } catch {
            errorText = error.localizedDescription
        }
    }
}

struct FiltersView: View {
    @Environment(AppSession.self) private var session
    @State private var model = FiltersModel()

    var body: some View {
        NavigationStack {
            Group {
                if model.loading, model.status == nil {
                    ProgressView("连接服务器中…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    list
                }
            }
            .navigationTitle("过滤器")
            .background(Color(.systemGroupedBackground))
            .refreshable { await model.refresh(session: session) }
        }
        .onAppear { Task { await model.refresh(session: session) } }
    }

    private var list: some View {
        List {
            if let error = model.errorText {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(Color.agDanger)
                }
            }
            if let status = model.status {
                Section {
                    HStack(alignment: .top, spacing: 12) {
                        StatTile(label: "规则总数", value: Fmt.compact(totalRules), sub: "含 \(status.userRules?.count ?? 0) 条自定义", tint: .agAccent)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("过滤器列表")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(blackWhiteAttributed)
                                .font(.system(size: 22, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                            Text(refreshSubtitle)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .agCard(cornerRadius: 16)
                        .overlay(alignment: .topTrailing) {
                            Button {
                                Task { await model.refresh(session: session) }
                            } label: {
                                Image(systemName: "arrow.clockwise")
                                    .font(.footnote)
                                    .frame(width: 30, height: 30)
                                    .background(Circle().fill(Color.primary.opacity(0.06)))
                            }
                            .padding(8)
                        }
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    Toggle("DNS 过滤", isOn: Binding(
                        get: { status.enabled },
                        set: { newValue in Task { await model.setEnabled(newValue, session: session) } }
                    ))
                    .padding(.vertical, 2)
                }
                Section("过滤功能") {
                    entryRows
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 3, leading: 16, bottom: 3, trailing: 16))
                }
                Section("安全防护") {
                    Toggle("浏览安全", isOn: Binding(
                        get: { model.safeBrowsing },
                        set: { newValue in Task { await model.setSafeBrowsing(newValue) } }
                    ))
                    .padding(.vertical, 2)
                    Toggle("家长控制", isOn: Binding(
                        get: { model.parental },
                        set: { newValue in Task { await model.setParental(newValue) } }
                    ))
                    .padding(.vertical, 2)
                }
                Section("拦截列表(\(status.filters.count))") {
                    ForEach(status.filters) { filter in
                        filterRow(filter, icon: "tray.full", tint: .agDanger)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 3, leading: 16, bottom: 3, trailing: 16))
                    }
                }
                if !status.whitelistFilters.isEmpty {
                    Section("白名单列表(\(status.whitelistFilters.count))") {
                        ForEach(status.whitelistFilters) { filter in
                            filterRow(filter, icon: "checkmark.shield", tint: .agOk)
                                .listRowBackground(Color.clear)
                                .listRowSeparator(.hidden)
                                .listRowInsets(EdgeInsets(top: 3, leading: 16, bottom: 3, trailing: 16))
                        }
                    }
                }
                if let rules = status.userRules, !rules.isEmpty {
                    Section("自定义规则(\(rules.count))") {
                        ForEach(Array(rules.enumerated()), id: \.offset) { _, rule in
                            HStack(spacing: 10) {
                                Image(systemName: "doc.text")
                                    .font(.caption)
                                    .foregroundStyle(Color.agViolet)
                                    .frame(width: 24, height: 24)
                                    .background(Color.agViolet.opacity(0.14))
                                    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                                Text(rule)
                                    .font(.caption.monospaced())
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .agCard(cornerRadius: 12)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 3, leading: 16, bottom: 3, trailing: 16))
                        }
                    }
                }
                Section {
                    Text("过滤器增删/规则编辑/服务拦截/重写管理等子页将在后续版本提供")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.agBg)
    }

    /// 过滤功能入口组(视觉对齐 Web;子页为占位页)
    private var entryRows: some View {
        ForEach(FilterEntry.presets) { entry in
            NavigationLink {
                FeaturePlaceholderView(title: entry.title)
            } label: {
                IconBubbleRow(icon: entry.icon, tint: entry.tint, title: entry.title, subtitle: entry.subtitle)
            }
            .buttonStyle(.plain)
        }
    }

    private var totalRules: Int {
        (model.status?.filters.reduce(0) { $0 + ($1.rulesCount ?? 0) } ?? 0)
            + (model.status?.whitelistFilters.reduce(0) { $0 + ($1.rulesCount ?? 0) } ?? 0)
            + (model.status?.userRules?.count ?? 0)
    }

    private var blackWhiteAttributed: AttributedString {
        var text = AttributedString("黑 \(model.status?.filters.count ?? 0)")
        text.foregroundColor = Color.agDanger
        var middle = AttributedString(" / ")
        middle.foregroundColor = Color.secondary
        var white = AttributedString("白 \(model.status?.whitelistFilters.count ?? 0)")
        white.foregroundColor = Color.agAccent
        return text + middle + white
    }

    private var refreshSubtitle: String {
        let updated = model.status?.filters.first?.lastUpdated
            ?? model.status?.whitelistFilters.first?.lastUpdated
        return "\(Fmt.relative(updated))更新"
    }
}

/// 过滤功能入口(Web 版防护页同款六项)
private struct FilterEntry: Identifiable {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String

    var id: String { title }

    static let presets: [FilterEntry] = [
        FilterEntry(icon: "line.3.horizontal.decrease", tint: .agDanger, title: "黑名单过滤器", subtitle: "广告与跟踪规则库"),
        FilterEntry(icon: "checkmark.circle", tint: .agOk, title: "白名单过滤器", subtitle: "例外规则列表"),
        FilterEntry(icon: "doc.badge.gearshape", tint: .agViolet, title: "自定义过滤规则", subtitle: "直接编写 AdGuard 过滤语法"),
        FilterEntry(icon: "app.badge", tint: .agWarn, title: "拦截服务", subtitle: "按服务拦截(YouTube、抖音等)"),
        FilterEntry(icon: "arrow.left.arrow.right", tint: .agInfo, title: "DNS 重写", subtitle: "自定义域名解析记录"),
        FilterEntry(icon: "magnifyingglass", tint: .agAccent, title: "规则检测工具", subtitle: "测试某域名会被哪条规则命中"),
    ]
}

extension FiltersView {
    private func filterRow(_ filter: Filter, icon: String, tint: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.footnote)
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(tint.opacity(0.14))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(filter.name)
                    .font(.subheadline.weight(.medium))
                Text("\(Fmt.num(filter.rulesCount)) 条规则")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(filter.enabled ? "已启用" : "已停用")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(filter.enabled ? Color.agOk : Color.secondary)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background((filter.enabled ? Color.agOk : Color.secondary).opacity(0.14))
                .clipShape(Capsule())
        }
        .padding(10)
        .agCard(cornerRadius: 16)
    }
}
