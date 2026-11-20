import Foundation
import XCTest
@testable import RealtimeLive

final class ProtocolTests: XCTestCase {
  private func frames(_ text: String) -> [SSEParser.Frame] {
    var parser = SSEParser()
    return text.components(separatedBy: "\n").compactMap { parser.feed($0) }
  }

  func testCommentAndEventFrames() throws {
    let out = frames(": connected\n\nevent: message\ndata: {\"subscriptionId\":\"s\",\"topic\":\"post:1\",\"type\":\"updated\",\"eventId\":\"e1\",\"data\":{\"title\":\"New\",\"n\":2}}\n\n")
    XCTAssertEqual(out.first, .comment("connected"))
    let event = try XCTUnwrap(out.compactMap(SSEParser.liveEvent(from:)).first)
    XCTAssertEqual(event.subscriptionId, "s")
    XCTAssertEqual(event.topic, "post:1")
    XCTAssertEqual(event.type, "updated")
    XCTAssertEqual(event.eventId, "e1")
    XCTAssertEqual(event.data, .object(["title": .string("New"), "n": .number(2)]))
  }

  func testEventWithoutOptionalFields() throws {
    let out = frames("data: {\"subscriptionId\":\"s\",\"topic\":\"t\"}\n\n")
    let event = try XCTUnwrap(out.compactMap(SSEParser.liveEvent(from:)).first)
    XCTAssertNil(event.type)
    XCTAssertNil(event.eventId)
    XCTAssertNil(event.data)
  }

  func testMultiLineDataJoinsAndDefaultEventIsMessage() {
    XCTAssertEqual(frames("data: a\ndata: b\n\n"), [.message(event: "message", data: "a\nb")])
  }

  func testOtherEventsAreNotLiveEvents() {
    let out = frames("event: ping\ndata: {\"subscriptionId\":\"s\",\"topic\":\"t\"}\n\n")
    XCTAssertNil(SSEParser.liveEvent(from: out[0]))
  }

  func testControlBody() throws {
    let body = try LiveControl.body(connectionId: "c1", operations: [
      .subscribe(id: "a", topic: "post:1", lastEventId: "e1"),
      .subscribe(id: "b", topic: "post:2", lastEventId: nil),
      .unsubscribe(id: "c"),
    ])
    let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    XCTAssertEqual(json["connectionId"] as? String, "c1")
    let ops = try XCTUnwrap(json["operations"] as? [[String: Any]])
    XCTAssertEqual(ops[0]["kind"] as? String, "subscribe")
    XCTAssertEqual(ops[0]["lastEventId"] as? String, "e1")
    XCTAssertNil(ops[1]["lastEventId"])
    XCTAssertEqual(ops[2]["kind"] as? String, "unsubscribe")
    XCTAssertEqual(ops[2]["id"] as? String, "c")
    XCTAssertNil(ops[2]["topic"])
  }

  func testControlResponses() throws {
    let ok = try XCTUnwrap(LiveControl.response(from: Data("""
      {"accepted":true,"connectionId":"c","results":[{"ok":true,"kind":"subscribe","id":"a","topic":"t"},{"ok":false,"kind":"subscribe","id":"b","error":{"code":"FORBIDDEN","message":"no"}}]}
      """.utf8)))
    XCTAssertTrue(ok.accepted)
    XCTAssertEqual(ok.results?.map(\.ok), [true, false])
    XCTAssertEqual(ok.results?.last?.error, LiveControl.ErrorBody(code: "FORBIDDEN", message: "no"))

    let refused = try XCTUnwrap(LiveControl.response(from: Data(#"{"accepted":false,"error":{"code":"CONNECTION_NOT_FOUND","message":"gone"}}"#.utf8)))
    XCTAssertFalse(refused.accepted)
    XCTAssertEqual(refused.error?.code, "CONNECTION_NOT_FOUND")
  }

  func testBackoffGrowsAndCaps() {
    XCTAssertEqual(LiveBackoff.seconds(attempt: 0), 1)
    XCTAssertEqual(LiveBackoff.seconds(attempt: 3), 8)
    XCTAssertEqual(LiveBackoff.seconds(attempt: 4), 16)
    XCTAssertEqual(LiveBackoff.seconds(attempt: 5), 30)
    XCTAssertEqual(LiveBackoff.seconds(attempt: 40), 30)
  }
}
