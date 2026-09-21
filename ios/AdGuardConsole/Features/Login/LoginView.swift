import SwiftUI

struct LoginView: View {
    @Environment(AppSession.self) private var session
    @State private var url = ""
    @State private var username = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    enum Field {
        case url, username, password
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 48)
            header
            form
            Spacer()
            footer
        }
        .padding(.horizontal, 24)
        .background(Color.agBg.ignoresSafeArea())
        .onAppear(perform: prefillFromDebugEnv)
    }

    private var header: some View {
        VStack(spacing: 12) {
            Image(systemName: "shield.lefthalf.filled.badge.checkmark")
                .font(.system(size: 38, weight: .medium))
                .foregroundStyle(.white)
                .frame(width: 76, height: 76)
                .background(
                    LinearGradient(colors: [Color.agAccent, Color.agInfo], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .shadow(color: Color.agAccent.opacity(0.30), radius: 16, y: 8)
            Text("AdGuard Home Console")
                .font(.title2.bold())
            Text("连接你的 AdGuard Home 实例")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(.bottom, 28)
    }

    private var form: some View {
        VStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("服务器地址").font(.caption).foregroundStyle(.secondary)
                TextField("http://192.168.1.1:3990", text: $url)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focusedField, equals: .url)
                    .fieldStyle(focused: focusedField == .url)
                    .onSubmit { focusedField = .username }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("用户名").font(.caption).foregroundStyle(.secondary)
                TextField("admin", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focusedField, equals: .username)
                    .fieldStyle(focused: focusedField == .username)
                    .onSubmit { focusedField = .password }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("密码").font(.caption).foregroundStyle(.secondary)
                SecureField("", text: $password)
                    .submitLabel(.go)
                    .focused($focusedField, equals: .password)
                    .fieldStyle(focused: focusedField == .password)
                    .onSubmit { Task { await connect() } }
            }
            if let error = session.errorText {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(Color.agDanger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button {
                Task { await connect() }
            } label: {
                Group {
                    if session.connecting {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("连接")
                            .font(.body.weight(.semibold))
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .foregroundStyle(.white)
                .background(
                    LinearGradient(colors: [Color.agAccent, Color.agInfo], startPoint: .leading, endPoint: .trailing)
                )
                .clipShape(Capsule())
                .overlay {
                    if !session.connecting {
                        Image(systemName: "arrow.right")
                            .font(.footnote.weight(.bold))
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .padding(.trailing, 18)
                            .allowsHitTesting(false)
                    }
                }
                .opacity(url.isEmpty || username.isEmpty ? 0.45 : 1)
            }
            .disabled(session.connecting || url.isEmpty || username.isEmpty)
            .padding(.top, 4)
        }
        .padding(20)
        .agCard(cornerRadius: 22)
    }

    private var footer: some View {
        VStack(spacing: 4) {
            Text("凭据保存在本机 Keychain")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.bottom, 12)
    }

    private func connect() async {
        focusedField = nil
        _ = await session.connect(SvrConfig(url: url, username: username, password: password))
    }

    /// 自动化测试钩子:DEBUG 构建读环境变量预填并自动连接(release 无影响)
    private func prefillFromDebugEnv() {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment
        if let envURL = env["AGH_URL"], url.isEmpty {
            url = envURL
            username = env["AGH_USERNAME"] ?? username
            password = env["AGH_PASSWORD"] ?? password
        } else if url.isEmpty, let saved = session.configs.last {
            url = saved.url
            username = saved.username
            password = saved.password
        }
        if env["AGH_AUTOCONNECT"] == "1", !url.isEmpty {
            Task { await connect() }
        }
        #endif
    }
}
