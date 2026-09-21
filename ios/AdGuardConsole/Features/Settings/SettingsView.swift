import SwiftUI

/// 设置 tab(N7 前的基础版):服务器信息、主题覆盖、退出登录
struct SettingsView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        NavigationStack {
            List {
                if let status = session.status {
                    Text("AdGuard Home \(status.version)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
                if let cfg = session.cfg, let status = session.status {
                    Section("服务器") {
                        LabeledRow("地址", cfg.url)
                        LabeledRow("版本", "AdGuard Home \(status.version)")
                        LabeledRow("运行状态", status.running ? "正常" : "停止")
                        LabeledRow("DNS 端口", "\(status.dnsPort)")
                    }
                }
                Section("管理") {
                    ForEach(SettingsEntry.presets) { entry in
                        NavigationLink {
                            FeaturePlaceholderView(title: entry.title)
                        } label: {
                            IconBubbleRow(icon: entry.icon, tint: entry.tint, title: entry.title, subtitle: entry.subtitle)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 3, leading: 16, bottom: 3, trailing: 16))
                    }
                }
                Section("外观") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("主题").font(.subheadline)
                        AGSegmented(
                            options: ThemeSetting.allCases.map { ($0.label, $0.rawValue) },
                            selection: Binding(
                                get: { session.theme.rawValue },
                                set: { session.setTheme(ThemeSetting(rawValue: $0) ?? .auto) }
                            )
                        )
                    }
                    .padding(.vertical, 2)
                }
                if let error = session.errorText {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(Color.agDanger)
                    }
                }
                Section {
                    Button(role: .destructive) {
                        session.logout()
                    } label: {
                        Text("退出登录")
                            .frame(maxWidth: .infinity)
                    }
                }
                Section("关于") {
                    LabeledRow("App 版本", "1.0.0(原生版,施工中)")
                    LabeledRow("说明", "DNS/加密/DHCP 等完整设置将在后续版本提供")
                }
                Section {
                    Text("AdGuard Home Console v1.0.0")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            }
            .navigationTitle("设置")
            .scrollContentBackground(.hidden)
            .background(Color.agBg)
        }
        .refreshable { await session.refreshStatus() }
    }
}

/// 设置页功能入口(Web 版设置页同款七项;子页为占位页)
private struct SettingsEntry: Identifiable {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String

    var id: String { title }

    static let presets: [SettingsEntry] = [
        SettingsEntry(icon: "doc.plaintext", tint: .agInfo, title: "查询日志与统计", subtitle: "保留时长与匿名化配置"),
        SettingsEntry(icon: "network", tint: .agAccent, title: "DNS 设置", subtitle: "上游/Bootstrap/拦截模式/缓存"),
        SettingsEntry(icon: "wrench.and.screwdriver", tint: .agViolet, title: "访问控制", subtitle: "允许与拒绝的客户端、域名"),
        SettingsEntry(icon: "lock.shield", tint: .agWarn, title: "加密设置", subtitle: "HTTPS/DoT/DoQ 与证书"),
        SettingsEntry(icon: "wifi", tint: .agOk, title: "DHCP", subtitle: "接口/租约/静态分配"),
        SettingsEntry(icon: "gearshape", tint: .agInfo, title: "应用设置", subtitle: "主题与本地偏好"),
        SettingsEntry(icon: "shield.lefthalf.filled", tint: .agDanger, title: "系统管理", subtitle: "版本检查/清缓存/重置统计"),
    ]
}

struct LabeledRow: View {
    let title: String
    let value: String

    init(_ title: String, _ value: String) {
        self.title = title
        self.value = value
    }

    var body: some View {
        HStack {
            Text(title)
            Spacer(minLength: 12)
            Text(value)
                .foregroundStyle(.secondary)
                .font(.footnote)
                .textSelection(.enabled)
                .multilineTextAlignment(.trailing)
        }
    }
}
