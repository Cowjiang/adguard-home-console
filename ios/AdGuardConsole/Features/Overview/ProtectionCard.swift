import SwiftUI

/// 防护总开关卡:开关 + 定时暂停(30s~3h,毫秒换算)+ 到期倒计时(锁快照)
struct ProtectionCard: View {
    @Environment(AppSession.self) private var session
    @State private var busy = false

    /// (label, seconds):0 = 直到手动开启;duration 上送毫秒
    private static let pauseOptions: [(String, Int)] = [
        ("直到手动开启", 0),
        ("30 秒", 30),
        ("5 分钟", 300),
        ("30 分钟", 1800),
        ("1 小时", 3600),
        ("3 小时", 10800),
    ]

    private var enabled: Bool { session.status?.protectionEnabled ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                Image(systemName: enabled ? "shield.lefthalf.filled" : "shield.slash")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(enabled ? Color.agAccent : Color.agDanger)
                    .frame(width: 52, height: 52)
                    .background((enabled ? Color.agAccent : Color.agDanger).opacity(0.14))
                    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(enabled ? "防护已开启" : "防护已暂停")
                        .font(.headline)
                    subtitle
                }
                Spacer()
                Toggle("", isOn: Binding(
                    get: { enabled },
                    set: { newValue in
                        if newValue {
                            // 直接打开:立即恢复防护(对齐 Web 版 Switch onChange 正向分支)
                            Task { await setProtection(true, seconds: 0) }
                        } else {
                            // 关闭动作走定时暂停菜单;开关先弹回,等菜单选择后由服务端状态确认
                            Task { await session.refreshStatus() }
                        }
                    }
                ))
                .labelsHidden()
                .disabled(busy)
            }
            HStack(spacing: 10) {
                Menu {
                    ForEach(Self.pauseOptions, id: \.1) { option in
                        Button(option.0 == "直到手动开启" ? option.0 : "暂停 \(option.0)") {
                            Task { await setProtection(false, seconds: option.1) }
                        }
                    }
                } label: {
                    capsuleButtonLabel(Label("定时暂停", systemImage: "clock"))
                }
                .menuStyle(.button)
                .disabled(busy)
                Button {
                    Task { await refresh() }
                } label: {
                    capsuleButtonLabel(Label("刷新状态", systemImage: "arrow.clockwise"))
                }
                .disabled(busy)
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.agCardBg)
                .overlay(
                    LinearGradient(
                        colors: [(enabled ? Color.agAccent : Color.agDanger).opacity(0.18), .clear],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder((enabled ? Color.agAccent : Color.agDanger).opacity(0.16), lineWidth: 1)
        )
    }

    private func capsuleButtonLabel(_ label: Label<Text, Image>) -> some View {
        label
            .font(.footnote.weight(.medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Capsule().fill(Color.primary.opacity(0.06)))
            .foregroundStyle(Color.primary)
    }

    @ViewBuilder
    private var subtitle: some View {
        if !enabled, let resumeAt = session.resumeAt {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = max(0, Int(resumeAt.timeIntervalSince(context.date)))
                Text(remaining > 0
                     ? "将于 \(Fmt.clock(resumeAt)) 恢复 · 剩 \(Fmt.duration(seconds: remaining))"
                     : "即将恢复…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } else if !enabled {
            Text("已暂停,直到手动开启")
                .font(.caption)
                .foregroundStyle(.secondary)
        } else {
            Text("全网拦截广告、跟踪器与恶意域名")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func setProtection(_ value: Bool, seconds: Int) async {
        busy = true
        await session.setProtection(enabled: value, durationMs: seconds * 1000)
        busy = false
    }

    private func refresh() async {
        busy = true
        await session.refreshStatus()
        busy = false
    }
}
