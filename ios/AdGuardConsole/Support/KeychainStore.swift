import Foundation
import Security

/// 凭据存 Keychain(kSecClassGenericPassword),绝不用 UserDefaults(PROJECT_MEMORY §2)
enum KeychainStore {
    static let service = "com.adguardhome.console"

    static func set(_ data: Data, account: String) throws {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        if status == errSecSuccess {
            let update: [String: Any] = [kSecValueData as String: data]
            let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
            guard updateStatus == errSecSuccess else { throw KeychainError.updateFailed(updateStatus) }
        } else if status == errSecItemNotFound {
            query[kSecValueData as String] = data
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let addStatus = SecItemAdd(query as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw KeychainError.addFailed(addStatus) }
        } else {
            throw KeychainError.lookupFailed(status)
        }
    }

    static func get(account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    static func remove(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    enum KeychainError: Error {
        case lookupFailed(OSStatus)
        case addFailed(OSStatus)
        case updateFailed(OSStatus)
    }
}

/// 多实例 SvrConfig 列表的 Keychain 存取(IOS_NATIVE_PLAN §2:Keychain 存多实例)
enum ConfigStore {
    static let account = "svr_configs.v1"

    static func load() -> [SvrConfig] {
        guard let data = KeychainStore.get(account: account) else { return [] }
        return (try? JSONDecoder().decode([SvrConfig].self, from: data)) ?? []
    }

    static func save(_ configs: [SvrConfig]) {
        guard let data = try? JSONEncoder().encode(configs) else { return }
        do { try KeychainStore.set(data, account: account) } catch {
            // Keychain 写失败不阻断 UI;下次登录时重试
        }
    }
}
