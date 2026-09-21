import Foundation

/// 数字与时间格式化,语义对齐 src/lib/format.ts
enum Fmt {
    static func num(_ n: Int?) -> String {
        guard let n else { return "—" }
        return NumberFormatter.grouped.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    static func compact(_ n: Int?) -> String {
        guard let n else { return "—" }
        if n >= 1_000_000 {
            let v = Double(n) / 1_000_000
            return String(format: n >= 10_000_000 ? "%.0fM" : "%.1fM", v)
        }
        if n >= 10_000 { return String(format: "%.1fk", Double(n) / 1000) }
        return num(n)
    }

    static func pct(_ part: Int, _ total: Int, digits: Int = 1) -> String {
        guard total > 0 else { return "0%" }
        return String(format: "%.\(digits)f%%", Double(part) / Double(total) * 100)
    }

    /// 入参是“秒”(AGH 的 avg_processing_time / top_upstreams_avg_time);<1 按毫秒显示,对齐 fmtMs
    static func ms(_ sec: Double?) -> String {
        guard let sec, sec.isFinite else { return "—" }
        let msValue = sec < 1 ? sec * 1000 : sec
        if msValue < 1000 { return String(format: msValue < 10 ? "%.2f ms" : "%.0f ms", msValue) }
        return String(format: "%.2f s", msValue / 1000)
    }

    static func duration(seconds: Int) -> String {
        guard seconds > 0 else { return "0 秒" }
        let d = seconds / 86400
        let h = seconds % 86400 / 3600
        let m = seconds % 3600 / 60
        let s = seconds % 60
        var parts: [String] = []
        if d > 0 { parts.append("\(d) 天") }
        if h > 0 { parts.append("\(h) 小时") }
        if m > 0 { parts.append("\(m) 分钟") }
        if d == 0 && h == 0 && s > 0 { parts.append("\(s) 秒") }
        let shown = parts.prefix(2)
        return shown.isEmpty ? "0 秒" : shown.joined(separator: " ")
    }

    static func uptime(startMs: Double) -> String {
        let seconds = Int(Date().timeIntervalSince1970 * 1000 - startMs) / 1000
        return duration(seconds: seconds)
    }

    /// 相对时间(对齐 format.ts relTime)
    static func relative(_ iso: String?) -> String {
        guard let iso, let date = parseISO(iso) else { return "从未" }
        let diff = Date().timeIntervalSince(date)
        if diff < 10 { return "刚刚" }
        if diff < 60 { return "\(Int(diff)) 秒前" }
        if diff < 3600 { return "\(Int(diff / 60)) 分钟前" }
        if diff < 86400 { return "\(Int(diff / 3600)) 小时前" }
        return "\(Int(diff / 86400)) 天前"
    }

    static func clock(_ date: Date) -> String {
        DateFormatter.clock.string(from: date)
    }

    static func hourLabel(_ date: Date) -> String {
        DateFormatter.hourOnly.string(from: date)
    }

    /// AGH 返回 RFC3339,可能带毫秒;两种格式都试
    static func parseISO(_ string: String) -> Date? {
        if let d = DateFormatter.isoSeconds.date(from: string) { return d }
        return DateFormatter.isoMillis.date(from: string)
    }
}

extension NumberFormatter {
    static let grouped: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "zh_CN")
        return f
    }()
}

extension DateFormatter {
    static let clock: DateFormatter = make("HH:mm:ss")
    static let hourOnly: DateFormatter = make("HH:00")
    static let isoSeconds: DateFormatter = makeISO(fractional: false)
    static let isoMillis: DateFormatter = makeISO(fractional: true)

    private static func make(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.dateFormat = format
        f.locale = Locale(identifier: "zh_CN")
        return f
    }

    private static func makeISO(fractional: Bool) -> DateFormatter {
        let f = DateFormatter()
        f.dateFormat = fractional ? "yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX" : "yyyy-MM-dd'T'HH:mm:ssXXXXX"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }
}
