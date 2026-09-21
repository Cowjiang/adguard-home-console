import SwiftUI

enum MainTab: Hashable {
    case overview
    case filters
    case log
    case settings
}

struct MainTabView: View {
    @State private var selection: MainTab = .overview

    var body: some View {
        TabView(selection: $selection) {
            OverviewView()
                .tabItem { Label("概览", systemImage: "shield.lefthalf.filled") }
                .tag(MainTab.overview)
            FiltersView()
                .tabItem { Label("过滤器", systemImage: "line.3.horizontal.decrease.circle") }
                .tag(MainTab.filters)
            QueryLogView()
                .tabItem { Label("日志", systemImage: "list.bullet.rectangle") }
                .tag(MainTab.log)
            SettingsView()
                .tabItem { Label("设置", systemImage: "gearshape") }
                .tag(MainTab.settings)
        }
        .tabBarMinimizeBehavior(.onScrollDown)
    }
}
