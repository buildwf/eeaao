package com.builtbyfriends.realtime.live

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ProtocolTest {
    private fun frames(text: String): List<SseFrame> {
        val parser = SseParser()
        return text.split("\n").mapNotNull(parser::feed)
    }

    @Test fun commentAndEventFrames() {
        val out = frames(": connected\n\nevent: message\ndata: {\"subscriptionId\":\"s\",\"topic\":\"post:1\",\"type\":\"updated\",\"eventId\":\"e1\",\"data\":{\"title\":\"New\"}}\n\n")
        assertEquals(SseFrame.Comment("connected"), out.first())
        val event = out.mapNotNull(SseParser::liveEvent).first()
        assertEquals("s", event.subscriptionId)
        assertEquals("post:1", event.topic)
        assertEquals("updated", event.type)
        assertEquals("e1", event.eventId)
        assertEquals("New", event.data!!.jsonObject["title"]!!.jsonPrimitive.content)
    }

    @Test fun eventWithoutOptionalFields() {
        val event = frames("data: {\"subscriptionId\":\"s\",\"topic\":\"t\"}\n\n").mapNotNull(SseParser::liveEvent).first()
        assertNull(event.type)
        assertNull(event.eventId)
        assertNull(event.data)
    }

    @Test fun multiLineDataJoinsAndDefaultEventIsMessage() {
        assertEquals(listOf<SseFrame>(SseFrame.Message("message", "a\nb")), frames("data: a\ndata: b\n\n"))
    }

    @Test fun otherEventsAndBrokenJsonAreNotLiveEvents() {
        assertNull(SseParser.liveEvent(frames("event: ping\ndata: {\"subscriptionId\":\"s\",\"topic\":\"t\"}\n\n").first()))
        assertNull(SseParser.liveEvent(frames("data: nope\n\n").first()))
    }

    @Test fun controlBody() {
        val body = Json.parseToJsonElement(
            LiveControl.body("c1", listOf(
                LiveControl.Operation.Subscribe("a", "post:1", "e1"),
                LiveControl.Operation.Subscribe("b", "post:2"),
                LiveControl.Operation.Unsubscribe("c"),
            )),
        ).jsonObject
        assertEquals("c1", body["connectionId"]!!.jsonPrimitive.content)
        val ops = body["operations"]!!.jsonArray.map { it.jsonObject }
        assertEquals("e1", ops[0]["lastEventId"]!!.jsonPrimitive.content)
        assertNull(ops[1]["lastEventId"])
        assertEquals("unsubscribe", ops[2]["kind"]!!.jsonPrimitive.content)
        assertNull(ops[2]["topic"])
    }

    @Test fun controlResponses() {
        val ok = assertNotNull(LiveControl.response("""{"accepted":true,"connectionId":"c","results":[{"ok":true,"kind":"subscribe","id":"a","topic":"t"},{"ok":false,"kind":"subscribe","id":"b","error":{"code":"FORBIDDEN","message":"no"}}]}"""))
        assertTrue(ok.accepted)
        assertEquals(listOf(true, false), ok.results.map { it.ok })
        assertEquals(LiveControl.Error("FORBIDDEN", "no"), ok.results.last().error)
        val refused = assertNotNull(LiveControl.response("""{"accepted":false,"error":{"code":"CONNECTION_NOT_FOUND","message":"gone"}}"""))
        assertFalse(refused.accepted)
        assertEquals("CONNECTION_NOT_FOUND", refused.error!!.code)
    }

    @Test fun backoffGrowsAndCaps() {
        assertEquals(1_000L, liveBackoffMillis(0))
        assertEquals(8_000L, liveBackoffMillis(3))
        assertEquals(16_000L, liveBackoffMillis(4))
        assertEquals(30_000L, liveBackoffMillis(5))
        assertEquals(30_000L, liveBackoffMillis(40))
    }
}
