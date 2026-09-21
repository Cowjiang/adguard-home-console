import SwiftUI

struct OverviewView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var model = OverviewModel()
    @State private var topTab: TopListsCard.TopTab = .domains
    @State private var showAllTop = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let error = model.statsError, model.stats == nil {
                        errorState(error)
                    } else if model.loading, model.stats == nil {
                        loadingState
                    } else {
                        content
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
            .navigationTitle("概览")
            .navigationBarTitleDisplayMode(.large)
            .background(Color.agBg)
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

    private var content: some View {
        VStack(spacing: 14) {
            statusCapsule
            ProtectionCard()
            StatTiles(
                stats: model.stats,
                clientsCount: model.clients?.totalCount ?? 0,
                persistentCount: model.clients?.clients?.count ?? 0
            )
            TrendChart(points: model.trendPoints, range: $model.trendRange)
            DonutCard(segments: model.donutSegments, total: model.stats?.numDnsQueries ?? 0)
            TopListsCard(
                selection: $topTab,
                queried: showAllTop ? model.topQueriedAll : model.topQueried,
                blocked: showAllTop ? model.topBlockedAll : model.topBlocked,
                clients: showAllTop ? model.topClientsAll : model.topClients,
                expanded: $showAllTop
            )
            UpstreamCard(upstreams: model.upstreams)
            if let status = session.status {
                ServerInfoCard(status: status)
            }
        }
    }

    /// 顶部状态胶囊(Web 版标志性元素;内联于滚动内容,非悬浮玻璃)
    private var statusCapsule: some View {
        let enabled = session.status?.protectionEnabled ?? false
        return HStack(spacing: 8) {
            Circle()
                .fill(enabled ? Color.agAccent : Color.agDanger)
                .frame(width: 6, height: 6)
            Text(enabled ? "防护运行中" : "防护已暂停")
                .font(.footnote.weight(.medium))
            Text("| AdGuard Home Console")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .agCard(cornerRadius: 999)
        .frame(maxWidth: .infinity)
    }

    private var loadingState: some View {
        VStack(spacing: 8) {
            ProgressView()
            Text("连接服务器中…")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 64)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark")
                .font(.title2)
                .foregroundStyle(.secondary)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("重试") { Task { await model.refreshNow() } }
                .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }
}
