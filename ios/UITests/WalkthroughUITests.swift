import XCTest

/// 走查 UI 测试:真实点按 tab、滚动、防护定时暂停端到端(打 mock,POST /protection)
/// 注意:用例对 mock 的 protection 状态自适应(开/停均可起步),避免前次运行残留状态导致假失败。
final class WalkthroughUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testWalkthroughAndCapture() throws {
        let app = XCUIApplication()
        app.launchEnvironment["AGH_URL"] = "http://127.0.0.1:3990"
        app.launchEnvironment["AGH_USERNAME"] = "admin"
        app.launchEnvironment["AGH_PASSWORD"] = "demo"
        app.launchEnvironment["AGH_AUTOCONNECT"] = "1"
        app.launch()

        // 概览:tab bar 出现即已登录,防护卡文案无论开关状态都应出现
        XCTAssertTrue(app.tabBars.buttons["概览"].waitForExistence(timeout: 20), "登录后应进入概览")
        let protectionOn = app.staticTexts["防护已开启"]
        let protectionOff = app.staticTexts["防护已暂停"]
        XCTAssertTrue(protectionOn.waitForExistence(timeout: 10) || protectionOff.exists, "防护卡应出现")
        XCTAssertTrue(app.staticTexts["今日查询"].waitForExistence(timeout: 10))
        sleep(2)
        capture(app, "02-overview")

        // 先走完各 tab(滚动会触发 tab bar 收起,故滚动统一放到最后)
        tapTab(app, "过滤器")
        XCTAssertTrue(app.staticTexts["DNS 过滤"].waitForExistence(timeout: 10))
        sleep(1)
        capture(app, "04-filters")

        // 日志 tab(segmented Picker 的段在 XCUITest 里是 button)
        tapTab(app, "日志")
        let allChip = app.buttons["全部"].waitForExistence(timeout: 10) ? app.buttons["全部"] : app.staticTexts["全部"]
        XCTAssertTrue(allChip.waitForExistence(timeout: 5), "日志筛选应出现")
        sleep(3)
        capture(app, "03-log")

        // 设置 tab(入口组变长,退出登录可能滚出 List 可见区,List 懒加载下需先滚动)
        tapTab(app, "设置")
        var logout = app.buttons["退出登录"].exists ? app.buttons["退出登录"] : app.staticTexts["退出登录"]
        if !logout.exists {
            app.swipeUp(velocity: .slow)
            sleep(1)
        }
        logout = app.buttons["退出登录"].exists ? app.buttons["退出登录"] : app.staticTexts["退出登录"]
        XCTAssertTrue(logout.waitForExistence(timeout: 10))
        sleep(1)
        capture(app, "05-settings")

        // 回概览,最后做滚动截图(tab bar 即便收起也不影响后续断言)
        tapTab(app, "概览")
        XCTAssertTrue(app.staticTexts["今日查询"].waitForExistence(timeout: 10))
        app.swipeUp(velocity: .slow)
        sleep(1)
        capture(app, "07-overview-bottom")

        // 日志页滚动态
        tapTab(app, "日志")
        sleep(2)
        app.swipeUp(velocity: .slow)
        sleep(1)
        capture(app, "09-log-scrolled")
    }

    /// tabBarMinimizeBehavior 会让 tab bar 收起(Collapsed),收起态下其余按钮不暴露;
    /// 下滑一次触发展开后再点
    @MainActor
    private func tapTab(_ app: XCUIApplication, _ name: String) {
        let button = app.tabBars.buttons[name]
        if button.waitForExistence(timeout: 3) {
            button.tap()
            return
        }
        app.swipeDown(velocity: .fast)
        sleep(1)
        if button.waitForExistence(timeout: 3) {
            button.tap()
            return
        }
        XCTAssertTrue(button.waitForExistence(timeout: 5), "tab \(name) 不可见(展开失败)")
        button.tap()
    }

    @MainActor
    func testProtectionPauseE2E() throws {
        let app = XCUIApplication()
        app.launchEnvironment["AGH_URL"] = "http://127.0.0.1:3990"
        app.launchEnvironment["AGH_USERNAME"] = "admin"
        app.launchEnvironment["AGH_PASSWORD"] = "demo"
        app.launchEnvironment["AGH_AUTOCONNECT"] = "1"
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["概览"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["定时暂停"].waitForExistence(timeout: 10))

        // 起步状态归一:若当前是暂停,先点开关恢复防护
        if app.staticTexts["防护已暂停"].exists {
            app.switches.firstMatch.tap()
            XCTAssertTrue(app.staticTexts["防护已开启"].waitForExistence(timeout: 10), "应能恢复防护")
        }

        // 定时暂停菜单 → 暂停 3 小时(避免用例执行期内到期造成竞态)→ 服务端确认后开关落下并出倒计时
        app.buttons["定时暂停"].tap()
        let pause3h = app.buttons["暂停 3 小时"]
        XCTAssertTrue(pause3h.waitForExistence(timeout: 5), "暂停菜单应弹出")
        pause3h.tap()

        let countdown = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '剩'")).firstMatch
        XCTAssertTrue(countdown.waitForExistence(timeout: 10), "暂停后应显示倒计时")
        XCTAssertTrue(app.staticTexts["防护已暂停"].waitForExistence(timeout: 5))
        sleep(1)
        capture(app, "08-protection-paused")

        // 恢复:点开关开回去,留下干净状态
        app.switches.firstMatch.tap()
        XCTAssertTrue(app.staticTexts["防护已开启"].waitForExistence(timeout: 10), "重新开启后防护卡应恢复")
    }

    @MainActor
    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
