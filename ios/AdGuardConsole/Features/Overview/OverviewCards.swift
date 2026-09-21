import SwiftUI

/// Top 榜单:热门域名/拦截域名/活跃客户端,胶囊分段 + 三列条目(对齐 Web BarList)
struct TopListsCard: View {
    @Binding var selection: TopTab
    let queried: [KVPair]
    let blocked: [KVPair]
    let clients: [(name: String, value: Double)]
    @Binding var expanded: Bool

    enum TopTab: String, CaseIterable, Identifiable {
        case domains = "热门域名"
        case blocked = "拦截域名"
        case clients = "活跃客户端"

        var id: String { rawValue }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AGSegmented(
                options: TopTab.allCases.map { ($0.rawValue, $0.rawValue) },
                selection: Binding(
                    get: { selection.rawValue },
                    set: { selection = TopTab(rawValue: $0) ?? .domains }
                )
            )
            content
            Button {
                withAnimation(.spring(duration: 0.3)) { expanded.toggle() }
            } label: {
                Text(expanded ? "收起" : "查看更多")
                    .font(.footnote.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(Color.primary.opacity(0.05)))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .agCard(cornerRadius: 20)
    }

    @ViewBuilder
    private var content: some View {
        switch selection {
        case .domains:
            if queried.isEmpty {
                empty("暂无查询记录")
            } else {
                BarList(entries: queried.map { ($0.key, $0.value) }, color: .agAccent)
            }
        case .blocked:
            if blocked.isEmpty {
                empty("暂无拦截记录", icon: "shield.slash", subtitle: "你的网络环境非常干净")
            } else {
                BarList(entries: blocked.map { ($0.key, $0.value) }, color: .agDanger)
            }
        case .clients:
            if clients.isEmpty {
                empty("暂无客户端数据")
            } else {
                BarList(entries: clients.map { ($0.name, $0.value) }, color: .agInfo)
            }
        }
    }

    private func empty(_ title: String, icon: String = "tray", subtitle: String? = nil) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(.tertiary)
            Text(title).font(.subheadline).foregroundStyle(.secondary)
            if let subtitle {
                Text(subtitle).font(.caption).foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }
}

/// 名称 | 7pt 细条(按值占比) | 右对齐数值,三列布局(对齐 Web BarList)
struct BarList: View {
    let entries: [(String, Double)]
    let color: Color

    var body: some View {
        let maxValue = entries.map { $0.1 }.max() ?? 1
        VStack(spacing: 8) {
            ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
                BarRow(name: entry.0, value: entry.1, maxValue: maxValue, color: color)
            }
        }
    }
}

struct BarRow: View {
    let name: String
    let value: Double
    let maxValue: Double
    let color: Color

    var body: some View {
        GeometryReader { geo in
            let nameWidth = geo.size.width * 0.46
            let barWidth = max(3, (geo.size.width - nameWidth - 52) * (maxValue > 0 ? value / maxValue : 0))
            HStack(spacing: 8) {
                Text(name)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .frame(width: nameWidth, alignment: .leading)
                ZStack(alignment: .leading) {
                    Capsule().fill(color.opacity(0.14))
                    Capsule().fill(color).frame(width: barWidth)
                }
                .frame(height: 7)
                Text(Fmt.num(Int(value)))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(width: 44, alignment: .trailing)
            }
        }
        .frame(height: 24)
    }
}

/// 上游服务器:翡翠图标气泡 + 天蓝 info 徽标 + 响应数
struct UpstreamCard: View {
    let upstreams: [(url: String, count: Double, avgSec: Double?)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("上游服务器").font(.headline)
                Spacer()
                Image(systemName: "network.badge.shield.half.filled")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
            }
            if upstreams.isEmpty {
                Text("暂无上游数据")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            } else {
                ForEach(Array(upstreams.enumerated()), id: \.offset) { _, up in
                    HStack(spacing: 10) {
                        Image(systemName: "globe")
                            .font(.footnote)
                            .foregroundStyle(Color.agAccent)
                            .frame(width: 30, height: 30)
                            .background(Color.agAccent.opacity(0.14))
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                        Text(up.url)
                            .font(.caption.weight(.medium))
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .layoutPriority(1)
                        Spacer(minLength: 8)
                        Text(Fmt.ms(up.avgSec))
                            .font(.caption2.weight(.semibold))
                            .monospacedDigit()
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Color.agInfo.opacity(0.14))
                            .foregroundStyle(Color.agInfo)
                            .clipShape(Capsule())
                        Text(Fmt.num(Int(up.count)))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                            .frame(width: 40, alignment: .trailing)
                    }
                }
            }
        }
        .padding(16)
        .agCard(cornerRadius: 20)
    }
}

/// 服务器信息:运行状态 / DNS 端口 / 已运行
struct ServerInfoCard: View {
    let status: AGHStatus?

    var body: some View {
        HStack(spacing: 0) {
            infoCell(icon: "bolt.fill", label: "运行状态", value: runningText, good: status?.running ?? false)
            divider
            infoCell(icon: "laptopcomputer.and.arrow.down", label: "DNS 端口", value: status.map { "\($0.dnsPort)" } ?? "—", good: nil)
            divider
            infoCell(icon: "timer", label: "已运行", value: uptimeText, good: nil)
        }
        .padding(.vertical, 14)
        .agCard(cornerRadius: 20)
    }

    private var runningText: String {
        guard let status else { return "—" }
        return status.running ? "正常" : "停止"
    }

    private var uptimeText: String {
        status.map { Fmt.uptime(startMs: $0.startTime) } ?? "—"
    }

    private var divider: some View {
        Rectangle().fill(Color.agBorder).frame(width: 1, height: 30)
    }

    private func infoCell(icon: String, label: String, value: String, good: Bool?) -> some View {
        VStack(spacing: 3) {
            Label(label, systemImage: icon)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.footnote.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(good == true ? Color.agOk : Color.primary)
        }
        .frame(maxWidth: .infinity)
    }
}
