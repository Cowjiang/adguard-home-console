import SwiftUI

@main
struct AdGuardConsoleApp: App {
    @State private var session = AppSession()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .preferredColorScheme(session.preferredColorScheme)
                .tint(.accentColor)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await session.refreshStatus() }
            } else {
                session.cancelExpiryRefresh()
            }
        }
    }
}

struct RootView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        Group {
            if session.isLoggedIn {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .task { await session.bootstrap() }
    }
}
