import Charts
import SwiftUI

/// 24h 流量趋势:查询翡翠面积+描线、拦截天蓝细线,6/12/24h 切换(对齐 Dashboard/暗色实拍)
struct TrendChart: View {
    let points: [TrendPoint]
    @Binding var range: TrendRange

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("流量趋势").font(.headline)
                legend
                Spacer()
                Menu {
                    ForEach(TrendRange.allCases) { option in
                        Button(option.label) { range = option }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(range.label)
                        Image(systemName: "chevron.down")
                            .font(.caption2.weight(.semibold))
                    }
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .foregroundStyle(Color.primary)
                }
                .agCard(cornerRadius: 16)
            }
            chart
        }
        .padding(16)
        .agCard(cornerRadius: 20)
    }

    private var legend: some View {
        HStack(spacing: 10) {
            legendDot(Color.agAccent, "查询")
            legendDot(Color.agInfo, "拦截")
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }

    private func legendDot(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 3) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(text)
        }
    }

    private var chart: some View {
        Chart(trendSeries) { series in
            ForEach(series.values) { item in
                if series.name == "查询" {
                    AreaMark(
                        x: .value("时间", item.date),
                        y: .value("次数", item.value)
                    )
                    .interpolationMethod(.linear)
                    .foregroundStyle(.linearGradient(
                        colors: [Color.agAccent.opacity(0.30), Color.agAccent.opacity(0.03)],
                        startPoint: .top, endPoint: .bottom
                    ))
                }
                LineMark(
                    x: .value("时间", item.date),
                    y: .value("次数", item.value)
                )
                .interpolationMethod(.linear)
                .foregroundStyle(by: .value("系列", series.name))
                .lineStyle(StrokeStyle(lineWidth: series.name == "查询" ? 2 : 1.5, lineCap: .round))
            }
        }
        .chartForegroundStyleScale([
            "查询": Color.agAccent,
            "拦截": Color.agInfo,
        ])
        .chartLegend(.hidden)
        .chartXAxis {
            AxisMarks(values: .stride(by: .hour, count: max(1, range.rawValue / 6))) { _ in
                AxisValueLabel(format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits), centered: true)
                    .font(.caption2)
                    .foregroundStyle(Color.secondary)
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine()
                    .foregroundStyle(Color.agBorderColor)
            }
        }
        .frame(height: 170)
    }
}

/// 数据驱动多 series(文档模式:外层按 series 分组,防止同名 mark 合并产生跨图飞线)
private struct TrendSeriesData: Identifiable {
    let name: String
    let values: [TrendPointItem]
    var id: String { name }
}

private struct TrendPointItem: Identifiable {
    let date: Date
    let value: Int
    var id: TimeInterval { date.timeIntervalSince1970 }
}

extension TrendChart {
    private var trendSeries: [TrendSeriesData] {
        [
            TrendSeriesData(name: "查询", values: points.map { TrendPointItem(date: $0.date, value: $0.queries) }),
            TrendSeriesData(name: "拦截", values: points.map { TrendPointItem(date: $0.date, value: $0.blocked) }),
        ]
    }
}

/// 2×2 统计块(今日查询=翡翠/已拦截=玫红/平均耗时·客户端=天蓝,数值 22pt 圆体 tabular)
struct StatTiles: View {
    let stats: AGHStats?
    let clientsCount: Int
    let persistentCount: Int

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
            StatTile(label: "今日查询", value: Fmt.compact(stats?.numDnsQueries), sub: "\(Fmt.num(stats?.numDnsQueries)) 次", tint: .agAccent)
            StatTile(label: "已拦截", value: Fmt.compact(stats?.numBlockedFiltering), sub: blockedSub, tint: .agDanger)
            StatTile(label: "平均耗时", value: Fmt.ms(stats?.avgProcessingTime), sub: "单次解析", tint: .agInfo)
            StatTile(label: "客户端", value: Fmt.compact(clientsCount), sub: "\(persistentCount) 个持久 · \(clientsCount - persistentCount) 个自动", tint: .agInfo)
        }
    }

    private var blockedSub: String {
        guard let stats else { return "拦截率 0%" }
        return "拦截率 \(Fmt.pct(stats.numBlockedFiltering, stats.numDnsQueries))"
    }
}

struct StatTile: View {
    let label: String
    let value: String
    let sub: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .contentTransition(.numericText())
            Text(sub)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .agCard(cornerRadius: 16)
    }
}
