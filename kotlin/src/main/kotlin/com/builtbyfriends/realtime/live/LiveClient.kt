package com.builtbyfriends.realtime.live

import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Listens to a bwf live stream with a bearer token (or any headers) over OkHttp.
 *
 *     val live = LiveClient(
 *         url = "https://app.example.com/live",
 *         scope = appScope,
 *         onUnauthorized = { session.refresh() },
 *         headers = { mapOf("Authorization" to "Bearer ${session.accessToken()}") },
 *     )
 *     live.subscribe("wall", "wall:123")
 *     live.start()
 *     scope.launch { live.events.collect { reload() } }
 *     scope.launch { live.reconnects.collect { reload() } }
 *
 * bwf delivers at most once and replays nothing, so a value on [reconnects] means events may have
 * been missed while the stream was down. Fetch again when you see one.
 *
 * @param url The route that exports `live.connect` and `live.control`, for example `https://app.example.com/live`.
 * @param headers Called for every request, so it can return a fresh token each time.
 * @param onUnauthorized Called when the server answers 401, before the client tries again. Refresh the token here.
 * @param retryMillis How long to wait before reconnect attempt `n`, counting from 0.
 */
class LiveClient(
    url: String,
    private val scope: CoroutineScope,
    http: OkHttpClient = OkHttpClient(),
    private val headers: suspend () -> Map<String, String> = { emptyMap() },
    private val onUnauthorized: suspend () -> Unit = {},
    private val retryMillis: (attempt: Int) -> Long = ::liveBackoffMillis,
) {
    // The server sends a keep-alive every 15 seconds, so a quiet minute means the connection is dead.
    private val http = http.newBuilder().readTimeout(60, TimeUnit.SECONDS).build()
    private val url = url.toHttpUrl()
    private val connectionId = UUID.randomUUID().toString()
    private val subscriptions = ConcurrentHashMap<String, Subscription>()

    private class Subscription(val topic: String, @Volatile var lastEventId: String?)

    /** True while the stream is open and its subscriptions are in place. */
    val connected: StateFlow<Boolean> get() = connectedState
    private val connectedState = MutableStateFlow(false)

    /** Events for the topics you subscribed to. */
    val events: SharedFlow<LiveEvent> = MutableSharedFlow(extraBufferCapacity = 256, onBufferOverflow = BufferOverflow.SUSPEND)
    private val eventsOut get() = events as MutableSharedFlow<LiveEvent>

    /** One value each time the stream opens again after a drop. Events may have been missed: fetch again. */
    val reconnects: SharedFlow<Unit> = MutableSharedFlow(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    private val reconnectsOut get() = reconnects as MutableSharedFlow<Unit>

    /** A subscription the server refused while the client was restoring it after a reconnect. */
    val rejections: SharedFlow<LiveControl.Result> = MutableSharedFlow(extraBufferCapacity = 16, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    private val rejectionsOut get() = rejections as MutableSharedFlow<LiveControl.Result>

    @Volatile private var open = false
    private var hasOpened = false
    private var job: Job? = null
    @Volatile private var closed = false

    /** Opens the stream, and keeps it open, until [close]. Calling it again does nothing. */
    @Synchronized
    fun start() {
        if (job != null || closed) return
        job = scope.launch(Dispatchers.IO) { run() }
    }

    /**
     * Subscribes. With the same [id] it replaces the earlier subscription. Before the stream is open,
     * the subscription is held and sent on open. While open, this throws [LiveException.Rejected]
     * if the server refuses it.
     */
    suspend fun subscribe(id: String, topic: String, lastEventId: String? = null) {
        check(!closed) { "live: client is closed" }
        val previous = subscriptions.put(id, Subscription(topic, lastEventId))
        if (!open) return
        try {
            val failed = send(listOf(LiveControl.Operation.Subscribe(id, topic, lastEventId))).firstOrNull { !it.ok }
            if (failed != null) throw LiveException.Rejected(id, failed.error?.code.orEmpty(), failed.error?.message.orEmpty())
        } catch (e: Exception) {
            if (previous != null) subscriptions[id] = previous else subscriptions.remove(id)
            throw e
        }
    }

    suspend fun unsubscribe(id: String) {
        if (subscriptions.remove(id) == null || !open) return
        send(listOf(LiveControl.Operation.Unsubscribe(id)))
    }

    /** Stops listening for good. Make a new client to listen again. */
    @Synchronized
    fun close() {
        closed = true
        job?.cancel()
        job = null
        subscriptions.clear()
        open = false
        connectedState.value = false
    }

    private suspend fun run() {
        var attempt = 0
        while (scope.isActive && !closed) {
            try {
                listen { attempt = 0 }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (_: Exception) {
            }
            open = false
            connectedState.value = false
            currentCoroutineContext().ensureActive()
            delay(retryMillis(attempt))
            attempt++
        }
    }

    /** One connection, from open until it ends. It always ends by returning at end of stream or throwing. */
    private suspend fun listen(onOpen: () -> Unit) = withContext(Dispatchers.IO) {
        val call = http.newCall(
            Request.Builder()
                .url(url.newBuilder().addQueryParameter("connectionId", connectionId).build())
                .header("Accept", "text/event-stream")
                .apply { headers().forEach { (name, value) -> header(name, value) } }
                .get().build(),
        )
        val cancel = currentCoroutineContext()[Job]?.invokeOnCompletion { call.cancel() }
        try {
            call.execute().use { response ->
                if (response.code == 401) { onUnauthorized(); throw LiveException.Unauthorized() }
                if (response.code != 200) throw LiveException.Status(response.code)
                val source = response.body!!.source()

                val reconnect = hasOpened
                hasOpened = true
                open = true
                restoreSubscriptions()
                onOpen()
                connectedState.value = true
                if (reconnect) reconnectsOut.tryEmit(Unit)

                val parser = SseParser()
                while (true) {
                    ensureActive()
                    val line = source.readUtf8Line() ?: break
                    val event = parser.feed(line)?.let(SseParser::liveEvent) ?: continue
                    // Pass on only what this client subscribed to, with the topic it subscribed with.
                    val held = subscriptions[event.subscriptionId]?.takeIf { it.topic == event.topic } ?: continue
                    event.eventId?.let { held.lastEventId = it }
                    eventsOut.emit(event)
                }
            }
        } finally {
            cancel?.dispose()
        }
    }

    private suspend fun restoreSubscriptions() {
        val operations = subscriptions.map { (id, s) -> LiveControl.Operation.Subscribe(id, s.topic, s.lastEventId) }
        if (operations.isEmpty()) return
        send(operations).filter { !it.ok }.forEach { rejectionsOut.tryEmit(it) }
    }

    /** Sends operations in requests of at most 100, and returns every result. */
    private suspend fun send(operations: List<LiveControl.Operation>): List<LiveControl.Result> = withContext(Dispatchers.IO) {
        val results = mutableListOf<LiveControl.Result>()
        for (chunk in operations.chunked(LiveControl.MAX_OPERATIONS_PER_REQUEST)) {
            val request = Request.Builder().url(url)
                .apply { headers().forEach { (name, value) -> header(name, value) } }
                .post(LiveControl.body(connectionId, chunk).toRequestBody("application/json".toMediaType()))
                .build()
            http.newCall(request).execute().use { response ->
                if (response.code == 401) { onUnauthorized(); throw LiveException.Unauthorized() }
                val answer = LiveControl.response(response.body?.string().orEmpty())
                if (answer?.accepted != true) {
                    val error = answer?.error
                    throw if (error != null) LiveException.Refused(error.code, error.message) else LiveException.Status(response.code)
                }
                results += answer.results
            }
        }
        results
    }
}
