import Charts
import SwiftUI

/// 请求构成环形图(对齐 Dashboard 移动端 Donut:放行/拦截/安全浏览/安全搜索/家长控制)
struct DonutCard: View {
    let segments: [DonutSegment]
    let total: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("请求构成").font(.headline)
            HStack(spacing: 20) {
                donut
                legend
            }
            .frame(maxWidth: .infinity)
        }
        .padding(16)
        .agCard(cornerRadius: 20)
    }

    private var donut: some View {
        Chart(segments) { segment in
            SectorMark(
                angle: .value("数值", segment.value),
                innerRadius: .ratio(0.62),
                angularInset: 1.5
            )
            .cornerRadius(3)
            .foregroundStyle(segment.color)
        }
        .frame(width: 140, height: 140)
        .overlay {
            VStack(spacing: 1) {
                Text(Fmt.compact(total))
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .monospacedDigit()
                Text("总请求")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var legend: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(segments) { segment in
                HStack(spacing: 6) {
                    Circle().fill(segment.color).frame(width: 7, height: 7)
                    Text(segment.label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 8)
                    Text(Fmt.compact(segment.value))
                        .font(.caption.monospacedDigit().weight(.medium))
                    Text(Fmt.pct(segment.value, max(1, total)))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.tertiary)
                        .frame(width: 44, alignment: .trailing)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

struct DonutSegment: Identifiable {
    let label: String
    let value: Int
    let color: Color

    var id: String { label }
}
