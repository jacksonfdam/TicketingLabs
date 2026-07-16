package com.ticketinglabs.client.data

/**
 * Everything the app knows about the backend: a base URL and some timeouts. Nothing else.
 *
 * The base URL is the API Gateway address, injected as configuration. The app has no idea
 * which backend answers behind it, and there is deliberately no field here that could let
 * it find out. See the recipe on consuming the injected base URL.
 *
 * @property baseUrl the gateway address, e.g. "https://localhost/api".
 * @property requestTimeoutMs overall per-request deadline; exceeding it becomes a Timeout.
 * @property connectTimeoutMs connection establishment deadline.
 * @property maxRetries how many times a retriable request is retried before giving up.
 */
data class ApiConfig(
    val baseUrl: String,
    val requestTimeoutMs: Long = 15_000,
    val connectTimeoutMs: Long = 10_000,
    val maxRetries: Int = 2,
)
