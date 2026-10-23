import XCTest

@MainActor
final class DrumHeroUITests: XCTestCase {
    func testInitialAssessmentInterruptionDiscardsAttempt() {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--uitesting-reset"]
        app.launch()
        app.buttons["Initial skill assessment"].firstMatch.tap()
        app.buttons["Enable sound and check input"].tap()
        app.swipeUp()
        app.buttons["Snare"].firstMatch.tap()
        app.buttons["Begin assessment"].tap()
        app.buttons["Demonstrate and play"].tap()
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.buttons["Restart interrupted probe"].waitForExistence(timeout: 5))
        app.buttons["End assessment and view results"].tap()
        app.swipeUp()
        XCTAssertFalse(app.buttons["Use this starting plan"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Assessment interrupted results"; screenshot.lifetime = .keepAlways; add(screenshot)
    }

    func testInitialAssessmentQuizApplyAndRetake() {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--uitesting-reset"]
        app.launch()
        app.buttons["Initial skill assessment"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Enable sound and check input"].waitForExistence(timeout: 5))
        app.buttons["Enable sound and check input"].tap()
        app.swipeUp()
        app.buttons["Snare"].firstMatch.tap()
        app.buttons["Begin assessment"].tap()
        for _ in 0..<3 { app.buttons["Skip this domain"].tap() }
        let quizChoices = ["Four even quarter notes", "Eight even eighth notes", "A triplet on every beat", "Silence on beat one", "Two notes per beat", "Three even notes per beat", "Four notes per beat", "One note per beat", "Four", "Six", "Eight", "Twelve", "1 & 2 &", "1 e & a", "1 trip let 2 trip let", "Only the downbeats", "Five", "Five notes with rests between some beats"]
        let visibleAnswer = app.buttons.matching(NSPredicate(format: "label IN %@", quizChoices)).firstMatch
        XCTAssertTrue(visibleAnswer.waitForExistence(timeout: 5))
        visibleAnswer.tap()
        app.buttons["End assessment and view results"].tap()
        XCTAssertTrue(app.staticTexts["Assessment results"].waitForExistence(timeout: 5))
        app.swipeUp()
        app.buttons["Use this starting plan"].tap()
        app.buttons["Retake assessment"].tap()
        XCTAssertTrue(app.buttons["Begin assessment"].exists)
        XCTAssertTrue(app.buttons["Stop using assessment plan"].exists)
    }

    func testSightReadingPreviewCancelAndBackground() {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--uitesting-reset"]
        app.launch()
        if app.tabBars.buttons["Learn"].exists {
            app.tabBars.buttons["Learn"].tap()
        } else {
            // iPadOS exposes the floating tab strip outside the TabBar hierarchy.
            app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Learn")).firstMatch.tap()
        }
        app.buttons["Sight reading"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Start sight reading"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Save goal"].waitForExistence(timeout: 5))
        app.buttons["Save goal"].tap()
        XCTAssertTrue(app.staticTexts["sight-goal-status"].label.contains("saved"))
        app.buttons["New exercise"].tap()
        XCTAssertTrue(app.buttons["Share assignment code"].waitForExistence(timeout: 3))
        app.buttons["Prepare printable score"].tap()
        XCTAssertTrue(app.buttons["Print or share PDF"].waitForExistence(timeout: 5))
        app.buttons["Start sight reading"].tap()
        XCTAssertTrue(app.staticTexts["sight-status"].label.contains("Silent preview"))
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "Sight reading preview"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.buttons["Cancel attempt"].tap()
        XCTAssertTrue(app.staticTexts["sight-status"].label.contains("counts as practice"))
        app.buttons["Start sight reading"].tap()
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.staticTexts["sight-status"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["sight-status"].label.contains("counts as practice"))
    }

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
        app.swipeUp()
        app.swipeUp()
        let complete = app.buttons["lesson.complete"]
        XCTAssertTrue(complete.waitForExistence(timeout: 5))
        complete.tap()
        XCTAssertTrue(app.buttons["Lesson complete"].waitForExistence(timeout: 5))
    }

    // DHM-003/060: completed curriculum offers review instead of recommending a finished lesson.
    func testHomeOffersCurriculumReviewWhenAllLessonsAreComplete() {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--uitesting-reset", "--uitesting-complete-curriculum"]
        app.launch()
        XCTAssertTrue(app.buttons["home.review-curriculum"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["You completed all 12 lessons."].exists)
    }

    // DHM-013: a saved checkpoint is restored after leaving and reopening a lesson.
    func testLessonCheckpointCanBeSavedAndRestored() {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--uitesting-reset"]
        app.launch()
        app.tabBars.buttons["Learn"].tap()
        app.staticTexts["Meet the kit"].firstMatch.tap()
        app.swipeUp()
        app.swipeUp()

        let checkpoint = app.descendants(matching: .any).matching(identifier: "lesson.checkpoint").firstMatch
        XCTAssertTrue(checkpoint.waitForExistence(timeout: 5))
        checkpoint.tap()
        checkpoint.typeText("Keep the pulse relaxed.")
        app.buttons["lesson.checkpoint.save"].tap()
        XCTAssertTrue(app.staticTexts["Checkpoint saved."].waitForExistence(timeout: 5))

        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.staticTexts["Meet the kit"].firstMatch.tap()
        app.swipeUp()
        app.swipeUp()
        let restoredCheckpoint = app.descendants(matching: .any).matching(identifier: "lesson.checkpoint").firstMatch
        XCTAssertTrue(restoredCheckpoint.waitForExistence(timeout: 5))
        XCTAssertEqual(restoredCheckpoint.value as? String, "Keep the pulse relaxed.")
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

    // DHM-034/038: muting samples does not stop the visual timeline or require device permission.
    func testMutedPracticeKeepsTheVisualRoundActive() {
        let app = XCUIApplication()
        app.launchArguments += ["--uitesting", "--uitesting-reset"]
        app.launch()
        app.tabBars.buttons["Practice"].tap()
        app.buttons["Start"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Count in'")).firstMatch.waitForExistence(timeout: 5))

        app.buttons["practice.mute"].tap()
        XCTAssertTrue(app.buttons["Unmute samples"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Count in' OR label CONTAINS 'Step'")).firstMatch.exists)
        app.buttons["Reset"].tap()
        XCTAssertTrue(app.buttons["Start"].waitForExistence(timeout: 3))
    }

    // DHM-050/053: Trainer can be started and safely discarded before completion.
    func testTrainerCanStartAndResetAnUnfinishedRound() {
        let app = XCUIApplication()
        app.launchArguments += ["--uitesting", "--uitesting-reset"]
        app.launch()
        app.tabBars.buttons["Trainer"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["trainer.skillFocus"].waitForExistence(timeout: 5))
        app.swipeUp()
        app.buttons["Start round"].tap()
        XCTAssertTrue(app.buttons["Reset round"].waitForExistence(timeout: 5))
        app.buttons["Reset round"].tap()
        XCTAssertTrue(app.buttons["Start round"].waitForExistence(timeout: 3))
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
