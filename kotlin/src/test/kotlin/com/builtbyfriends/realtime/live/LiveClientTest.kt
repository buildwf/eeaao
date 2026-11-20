package com.builtbyfriends.realtime.live

import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Before
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

private const val EVENT = """data: {"subscriptionId":"wall","topic":"wall:1","type":"changed","eventId":"e1"}"""
private const val STRANGER = """data: {"subscriptionId":"other","topic":"wall:1"}"""
private const val OK = """{"accepted":true,"connectionId":"c","results":[{"ok":true,"kind":"subscribe","id":"wall","topic":"wall:1"}]}"""

/** The client against a fake of a bwf live route. */
class LiveClientTest {
    private lateinit var server: MockWebServer
    private lateinit var scope: CoroutineScope
    private val requests = CopyOnWriteArrayList<RecordedRequest>()

    @Before fun setUp() {
        server = MockWebServer().also { it.start() }
        scope = CoroutineScope(Job() + Dispatchers.IO)
    }

    @After fun tearDown() {
        scope.cancel()
        runCatching { server.shutdown() }
    }

    private fun client(onUnauthorized: suspend () -> Unit = {}) = LiveClient(
        url = server.url("/live").toString(),
        scope = scope,
        headers = { mapOf("Authorization" to "Bearer t1") },
        onUnauthorized = onUnauthorized,
        retryMillis = { 20L },
    )

    private fun route(stream: () -> MockResponse, control: () -> MockResponse = { MockResponse().setBody(OK) }) {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                return if (request.method == "GET") stream() else control()
            }
        }
    }

    private fun sse(vararg lines: String) = MockResponse().setHeader("content-type", "text/event-stream").setBody(lines.joinToString("\n\n", postfix = "\n\n"))

    @Test fun sendsTheTokenSubscribesAndDeliversOnlyWhatItSubscribedTo() = runBlocking {
        route({ sse(": connected", STRANGER, EVENT) })
        val live = client()
        live.subscribe("wall", "wall:1") // before start: held until the stream opens
        live.start()
        val event = withTimeout(5_000) { live.events.first() }
        assertEquals("wall", event.subscriptionId)
        assertEquals("e1", event.eventId)
        live.close()

        val get = requests.first { it.method == "GET" }
        assertEquals("Bearer t1", get.getHeader("Authorization"))
        assertTrue(get.path!!.startsWith("/live?connectionId="))
        val post = requests.first { it.method == "POST" }
        assertEquals("Bearer t1", post.getHeader("Authorization"))
        val body = Json.parseToJsonElement(post.body.readUtf8()).jsonObject
        assertEquals("wall:1", body["operations"]!!.jsonArray.first().jsonObject["topic"]!!.jsonPrimitive.content)
        assertEquals(get.requestUrl!!.queryParameter("connectionId"), body["connectionId"]!!.jsonPrimitive.content)
    }

    @Test fun reconnectsWithTheSameIdSubscribesAgainAndReportsIt() = runBlocking {
        route({ sse(": connected") }) // ends right away, like a dropped stream
        val live = client()
        live.subscribe("wall", "wall:1")
        live.start()
        withTimeout(5_000) { live.reconnects.first() }
        live.close()
        val gets = requests.filter { it.method == "GET" }
        assertTrue(gets.size >= 2)
        assertEquals(gets[0].requestUrl!!.queryParameter("connectionId"), gets[1].requestUrl!!.queryParameter("connectionId"))
        assertTrue(requests.count { it.method == "POST" } >= 2)
    }

    @Test fun anExpiredTokenCallsOnUnauthorizedAndTriesAgain() = runBlocking {
        var served = 0
        route({ if (served++ == 0) MockResponse().setResponseCode(401) else sse(": connected", EVENT) })
        var refreshed = 0
        val live = client(onUnauthorized = { refreshed++ })
        live.subscribe("wall", "wall:1")
        live.start()
        withTimeout(5_000) { live.events.first() }
        live.close()
        assertEquals(1, refreshed)
    }

    @Test fun subscribingWhileOpenThrowsWhenTheServerRefuses() = runBlocking {
        val refused = """{"accepted":true,"connectionId":"c","results":[{"ok":false,"kind":"subscribe","id":"secret","error":{"code":"FORBIDDEN","message":"Forbidden"}}]}"""
        route(
            stream = { MockResponse().setHeader("content-type", "text/event-stream").setBody(": connected\n\n").setBodyDelay(3, java.util.concurrent.TimeUnit.SECONDS) },
            control = { MockResponse().setBody(refused) },
        )
        val live = client()
        live.start()
        withTimeout(5_000) { live.connected.first { it } }
        val error = assertFailsWith<LiveException.Rejected> { live.subscribe("secret", "secret:1") }
        assertEquals("FORBIDDEN", error.code)
        live.close()
    }
}
