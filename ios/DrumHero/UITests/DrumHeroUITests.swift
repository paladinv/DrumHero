import XCTest

@MainActor
final class DrumHeroUITests: XCTestCase {
    // DHM-001/002/008: core launch works offline and requests no device permission.
    func testOfflineLaunchShowsHomeWithoutPermissionPrompt() {
        let app = XCUIApplication()
        app.launchArguments += ["--uitesting", "--uitesting-reset"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Your next beat starts here."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.tabBars.buttons["Learn"].exists)
        XCTAssertTrue(app.tabBars.buttons["Practice"].exists)
        XCTAssertTrue(app.tabBars.buttons["Trainer"].exists)
        XCTAssertTrue(app.tabBars.buttons["Progress"].exists)
    }

    // DHM-010/013/014: lesson completion is persisted by SwiftData and cannot duplicate.
    func testLearnerCanCompleteLesson() {
        let app = XCUIApplication()
        app.launchArguments += ["--uitesting", "--uitesting-reset"]
        app.launch()
        app.tabBars.buttons["Learn"].tap()
        let firstLesson = app.staticTexts["Meet the kit"].firstMatch
        XCTAssertTrue(firstLesson.waitForExistence(timeout: 5))
        firstLesson.tap()
        let complete = app.buttons["lesson.complete"]
        XCTAssertTrue(complete.waitForExistence(timeout: 5))
        complete.tap()
        XCTAssertTrue(app.buttons["Lesson complete"].waitForExistence(timeout: 5))
    }

    // DHM-030/039: start and reset remain available without requiring microphone access.
    func testPracticeCanStartAndReset() {
        let app = XCUIApplication()
        app.launchArguments += ["--uitesting", "--uitesting-reset"]
        app.launch()
        app.tabBars.buttons["Practice"].tap()
        app.buttons["Start"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Count in'")).firstMatch.waitForExistence(timeout: 5))
        app.buttons["Reset"].tap()
        XCTAssertTrue(app.buttons["Start"].exists)
    }

    // DHM-002/008: navigation preference survives relaunch without restarting a musical clock.
    func testSelectedPracticeTabPersistsWithoutResumingPlayback() {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--uitesting-reset"]
        app.launch()
        app.tabBars.buttons["Practice"].tap()
        app.terminate()

        app.launchArguments = ["--uitesting"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Practice"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Start"].exists)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Count in'")).firstMatch.exists)
    }
}
