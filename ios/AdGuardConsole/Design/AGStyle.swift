import SwiftUI
import UIKit

// MARK: - 设计 token(对照 src/index.css;收敛自 .agents/reviews/2026-09-21-ios-ui-gap.md Top1/Top2)

extension Color {
    /// 深浅双值动态色(SwiftUI 无内置 init,经 UIColor trait 解析)
    init(light: UIColor, dark: UIColor) {
        self = Color(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark ? dark : light
        })
    }

    private init(lightRed: CGFloat, lightGreen: CGFloat, lightBlue: CGFloat,
                 darkRed: CGFloat, darkGreen: CGFloat, darkBlue: CGFloat) {
        self.init(
            light: UIColor(red: lightRed, green: lightGreen, blue: lightBlue, alpha: 1),
            dark: UIColor(red: darkRed, green: darkGreen, blue: darkBlue, alpha: 1)
        )
    }

    /// 强调/成功:翡翠
    static let agAccent = Color(lightRed: 0.020, lightGreen: 0.588, lightBlue: 0.412,
                                darkRed: 0.204, darkGreen: 0.827, darkBlue: 0.600)
    /// 拦截/危险:玫红
    static let agDanger = Color(lightRed: 0.882, lightGreen: 0.114, lightBlue: 0.282,
                                darkRed: 0.984, darkGreen: 0.443, darkBlue: 0.522)
    /// 信息/耗时:天蓝
    static let agInfo = Color(lightRed: 0.008, lightGreen: 0.518, lightBlue: 0.780,
                              darkRed: 0.220, darkGreen: 0.741, darkBlue: 0.973)
    /// 警告:琥珀
    static let agWarn = Color(lightRed: 0.706, lightGreen: 0.325, lightBlue: 0.035,
                              darkRed: 0.984, darkGreen: 0.749, darkBlue: 0.141)
    /// 重写:紫
    static let agViolet = Color(lightRed: 0.486, lightGreen: 0.227, lightBlue: 0.929,
                                darkRed: 0.655, darkGreen: 0.545, darkBlue: 0.980)
    /// 放行:亮翡翠
    static let agOk = Color(lightRed: 0.020, lightGreen: 0.588, lightBlue: 0.412,
                            darkRed: 0.290, darkGreen: 0.871, darkBlue: 0.502)
    /// 卡片实色底(深色 #121419,浅色白)
    static let agCardBg = Color(lightRed: 1, lightGreen: 1, lightBlue: 1,
                                darkRed: 0.071, darkGreen: 0.078, darkBlue: 0.098)
    /// 页面底色(深色 #060608,浅色 #EEF1F7)
    static let agBg = Color(lightRed: 0.933, lightGreen: 0.945, lightBlue: 0.969,
                            darkRed: 0.024, darkGreen: 0.024, darkBlue: 0.031)

    /// 卡片 1pt 边框(深色白 8%,浅色黑 7%)
    static let agBorderColor = Color(
        light: UIColor.black.withAlphaComponent(0.07),
        dark: UIColor.white.withAlphaComponent(0.08)
    )

    /// 查询类型色(照搬 constants.ts QTYPE_COLORS)
    static func qtype(_ type: String) -> Color {
        switch type {
        case "A", "MX": return .agAccent
        case "AAAA", "SRV": return .agInfo
        case "HTTPS": return .agViolet
        case "CNAME": return .agWarn
        case "PTR": return .agDanger
        case "TXT": return Color(red: 0.957, green: 0.447, blue: 0.714) // #f472b6
        default: return Color(red: 0.580, green: 0.639, blue: 0.722)    // #94a3b8
        }
    }
}

extension ShapeStyle where Self == Color {
    static var agCard: Color { .agCardBg }
    static var agBorder: Color { .agBorderColor }
    static var agBg: Color { .agBg }
    static var agAccent: Color { .agAccent }
    static var agDanger: Color { .agDanger }
    static var agInfo: Color { .agInfo }
}

extension View {
    /// 登录页输入框质感(实色圆角 + 1pt 边框,聚焦翡翠描边;对照 Web .field)
    func fieldStyle(focused: Bool) -> some View {
        self
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.primary.opacity(0.045))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(focused ? Color.agAccent.opacity(0.55) : Color.agBorderColor, lineWidth: 1)
            )
    }

    /// Web 版实色卡的 SwiftUI 翻译:实色底 + 1pt 边框 + 连续圆角(性能红线:不上材质/模糊)
    func agCard(cornerRadius: CGFloat = 20) -> some View {
        self
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color.agCardBg)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(Color.agBorderColor, lineWidth: 1)
            )
    }
}

// MARK: - 图标气泡行(Web 版入口组行样式;过滤器/设置页共用)

struct IconBubbleRow: View {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.footnote)
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(tint.opacity(0.14))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.primary)
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(12)
        .agCard(cornerRadius: 16)
        .contentShape(Rectangle())
    }
}

/// 子页未就绪时的占位页
struct FeaturePlaceholderView: View {
    let title: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "hammer.fill")
                .font(.title)
                .foregroundStyle(.tertiary)
            Text("\(title)建设中")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("该功能的完整管理界面将在后续版本提供")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.agBg)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - 胶囊分段控件(对照 Web 版 Segmented/Chip/主题分段;Top5)

struct AGSegmented: View {
    let options: [(label: String, tag: String)]
    @Binding var selection: String
    @Namespace private var namespace

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.tag) { option in
                let isSelected = selection == option.tag
                Button {
                    withAnimation(.spring(duration: 0.3)) { selection = option.tag }
                } label: {
                    Text(option.label)
                        .font(.footnote.weight(isSelected ? .semibold : .medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.vertical, 7)
                        .frame(maxWidth: .infinity)
                        .background {
                            if isSelected {
                                Capsule()
                                    .fill(Color.agAccent.opacity(0.16))
                                    .overlay(Capsule().strokeBorder(Color.agAccent.opacity(0.55), lineWidth: 1))
                                    .matchedGeometryEffect(id: "ag-segmented-slider", in: namespace)
                            }
                        }
                        .foregroundStyle(isSelected ? Color.agAccent : Color.secondary)
                        .contentShape(Capsule())
                        .accessibilityLabel(option.label)
                        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Capsule().fill(Color.agCardBg))
        .overlay(Capsule().strokeBorder(Color.agBorder, lineWidth: 1))
    }
}
