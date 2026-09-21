import Foundation
import Observation
import SwiftUI

enum ThemeSetting: String, CaseIterable, Identifiable {
    case auto
    case dark
    case light

    var id: String { rawValue }
    var label: String {
        switch self {
        case .auto: return "跟随系统"
        case .dark: return "深色"
        case .light: return "浅色"
        }
    }
}

/// 登录会话:多实例 SvrConfig(Keychain)、/status 探测、防护开关与暂停倒计时
@MainActor
@Observable
final class AppSession {
    private(set) var cfg: SvrConfig?
    private(set) var status: AGHStatus?
    var connecting = false
    var errorText: String?
    private(set) var configs: [SvrConfig] = []
    var theme: ThemeSetting

    /// 防护暂停截止时间,只在状态快照变化时更新一次(PROJECT_MEMORY 坑 5:勿随轮询重置)
    private(set) var resumeAt: Date?
    private var expiryTask: Task<Void, Never>?
    private var bootstrapped = false

    init() {
        theme = ThemeSetting(rawValue: UserDefaults.standard.string(forKey: "agh.console.theme.v1") ?? "") ?? .auto
        configs = ConfigStore.load()
    }

    var isLoggedIn: Bool { cfg != nil }

    var preferredColorScheme: ColorScheme? {
        switch theme {
        case .auto: return nil
        case .dark: return .dark
        case .light: return .light
        }
    }

    func setTheme(_ newTheme: ThemeSetting) {
        theme = newTheme
        UserDefaults.standard.set(newTheme.rawValue, forKey: "agh.console.theme.v1")
    }

    /// 启动时用已存配置探测连接;失败回登录页并保留配置用于预填
    func bootstrap() async {
        guard !bootstrapped else { return }
        bootstrapped = true
        guard cfg == nil, let saved = configs.first else { return }
        do {
            let s = try await APIClient(cfg: saved).getStatus()
            cfg = saved
            status = s
            apply(status: s)
        } catch {
            errorText = error.localizedDescription
        }
    }

    /// 登录:GET /status 探测,s.version 判定;成功存 Keychain
    func connect(_ next: SvrConfig) async -> Bool {
        connecting = true
        errorText = nil
        defer { connecting = false }
        var cleaned = next
        cleaned.url = next.url.trimmingCharacters(in: .whitespacesAndNewlines)
        while cleaned.url.hasSuffix("/") { cleaned.url.removeLast() }
        do {
            let s = try await APIClient(cfg: cleaned).getStatus()
            guard !s.version.isEmpty else {
                errorText = "响应不是 AdGuard Home"
                return false
            }
            cfg = cleaned
            status = s
            if let index = configs.firstIndex(of: cleaned) {
                configs[index] = cleaned
            } else {
                configs.append(cleaned)
            }
            ConfigStore.save(configs)
            apply(status: s)
            return true
        } catch {
            errorText = error.localizedDescription
            return false
        }
    }

    func logout() {
        if let current = cfg {
            configs.removeAll { $0 == current }
            ConfigStore.save(configs)
        }
        expiryTask?.cancel()
        expiryTask = nil
        cfg = nil
        status = nil
        resumeAt = nil
        errorText = nil
    }

    func refreshStatus() async {
        guard let cfg else { return }
        do {
            let s = try await APIClient(cfg: cfg).getStatus()
            status = s
            apply(status: s)
        } catch {
            // 状态刷新失败不打断 UI,保留旧数据(Web 版同语义)
        }
    }

    /// 防护开关/定时暂停:duration 毫秒,0 = 直到手动开启
    func setProtection(enabled: Bool, durationMs: Int = 0) async {
        guard let cfg else { return }
        errorText = nil
        do {
            try await APIClient(cfg: cfg).setProtection(enabled: enabled, durationMs: durationMs)
            await refreshStatus()
        } catch {
            errorText = "操作失败:" + error.localizedDescription
        }
    }

    private func apply(status s: AGHStatus) {
        guard !s.protectionEnabled else {
            resumeAt = nil
            expiryTask?.cancel()
            expiryTask = nil
            return
        }
        if let until = s.protectionDisabledUntil, let date = Fmt.parseISO(until) {
            resumeAt = date
        } else if s.protectionDisabledDuration > 0 {
            resumeAt = Date().addingTimeInterval(Double(s.protectionDisabledDuration) / 1000)
        } else {
            resumeAt = nil
        }
        scheduleExpiryRefresh()
    }

    /// 暂停到期后自动刷新,让界面及时恢复"防护已开启"(对齐 ProtectionCard.tsx)
    private func scheduleExpiryRefresh() {
        expiryTask?.cancel()
        guard let resumeAt else { return }
        expiryTask = Task { [weak self] in
            let wait = resumeAt.timeIntervalSinceNow + 1
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled else { return }
            await self?.refreshStatus()
        }
    }

    func cancelExpiryRefresh() {
        expiryTask?.cancel()
        expiryTask = nil
    }
}
