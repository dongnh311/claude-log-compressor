package com.example.myapp.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.example.myapp.data.UserRepository
import com.example.myapp.data.model.User
import javax.inject.Inject

/**
 * ViewModel responsible for authentication UI state and actions.
 * Exposes a single StateFlow<AuthState> that the UI observes.
 */
class AuthViewModel @Inject constructor(
    private val repository: UserRepository,
    private val analytics: AnalyticsTracker,
) : ViewModel() {

    companion object {
        const val TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000L
        const val MAX_LOGIN_RETRIES = 3

        fun defaultState(): AuthState = AuthState.Idle
    }

    private val _state: MutableStateFlow<AuthState> = MutableStateFlow(AuthState.Idle)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    private var retryCount: Int = 0
    private var lastTokenRefreshMs: Long = 0L

    /**
     * Log the user in with email + password. Updates [state] as the flow
     * progresses: Loading → (Success | Error).
     */
    fun login(email: String, password: String) {
        viewModelScope.launch {
            _state.value = AuthState.Loading
            try {
                val user = repository.login(email, password)
                analytics.track("login_success")
                retryCount = 0
                _state.value = AuthState.Success(user)
            } catch (e: Exception) {
                retryCount++
                analytics.track("login_failure")
                _state.value = AuthState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            repository.logout()
            _state.value = AuthState.Idle
        }
    }

    suspend fun refreshToken(): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastTokenRefreshMs < TOKEN_REFRESH_THRESHOLD_MS) return true
        return try {
            val newToken = repository.refreshToken()
            lastTokenRefreshMs = now
            _state.value = AuthState.Success(repository.currentUser())
            newToken.isNotEmpty()
        } catch (e: Exception) {
            _state.value = AuthState.Error(e.message ?: "token refresh failed")
            false
        }
    }

    private suspend fun validateCredentials(email: String, password: String): Boolean {
        if (email.isBlank() || password.isBlank()) return false
        if (!email.contains("@")) return false
        if (password.length < 8) return false
        return true
    }

    fun clearError() {
        val current = _state.value
        if (current is AuthState.Error) {
            _state.value = AuthState.Idle
        }
    }

    class SessionTimer(private val intervalMs: Long) {
        private var ticks: Long = 0
        fun tick() { ticks++ }
        fun reset() { ticks = 0 }
        fun elapsed(): Long = ticks * intervalMs
    }
}

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    data class Success(val user: User) : AuthState()
    data class Error(val message: String) : AuthState()
}

interface AnalyticsTracker {
    fun track(event: String)
    fun track(event: String, properties: Map<String, Any>)
}

typealias AuthStateCallback = (AuthState) -> Unit

/**
 * Deliberately long helper class used to exercise the smart_read chunker
 * in Phase 2 tests. Each method is a small, meaningful operation so the
 * outline view stays useful even though the whole class is ~400 lines.
 */
class AuthMetricsCollector(private val clock: Clock = Clock.systemDefaultZone()) {

    companion object {
        const val DEFAULT_WINDOW_MS = 60_000L
        const val MAX_BUFFERED_EVENTS = 1024

        fun empty(): AuthMetricsCollector = AuthMetricsCollector()
    }

    private val events: MutableList<MetricEvent> = mutableListOf()
    private var windowStartMs: Long = 0L
    private var flushCount: Long = 0L

    fun recordLoginAttempt(email: String, outcome: LoginOutcome) {
        val now = clock.millis()
        advanceWindow(now)
        events += MetricEvent.Login(timestamp = now, email = email, outcome = outcome)
        enforceCapacity()
    }

    fun recordLogout(userId: String) {
        val now = clock.millis()
        advanceWindow(now)
        events += MetricEvent.Logout(timestamp = now, userId = userId)
        enforceCapacity()
    }

    fun recordTokenRefresh(userId: String, success: Boolean) {
        val now = clock.millis()
        advanceWindow(now)
        events += MetricEvent.TokenRefresh(timestamp = now, userId = userId, success = success)
        enforceCapacity()
    }

    fun recordValidationFailure(reason: String) {
        val now = clock.millis()
        advanceWindow(now)
        events += MetricEvent.ValidationFailure(timestamp = now, reason = reason)
        enforceCapacity()
    }

    fun flush(): List<MetricEvent> {
        flushCount++
        val snapshot = events.toList()
        events.clear()
        return snapshot
    }

    fun summary(): MetricsSummary {
        val loginAttempts = events.count { it is MetricEvent.Login }
        val loginSuccess = events.count { it is MetricEvent.Login && it.outcome == LoginOutcome.Success }
        val loginFailure = events.count { it is MetricEvent.Login && it.outcome != LoginOutcome.Success }
        val logouts = events.count { it is MetricEvent.Logout }
        val refreshSuccess = events.count { it is MetricEvent.TokenRefresh && it.success }
        val refreshFailure = events.count { it is MetricEvent.TokenRefresh && !it.success }
        val validationFail = events.count { it is MetricEvent.ValidationFailure }
        return MetricsSummary(
            windowStartMs = windowStartMs,
            loginAttempts = loginAttempts,
            loginSuccess = loginSuccess,
            loginFailure = loginFailure,
            logouts = logouts,
            refreshSuccess = refreshSuccess,
            refreshFailure = refreshFailure,
            validationFailures = validationFail,
        )
    }

    private fun advanceWindow(now: Long) {
        if (now - windowStartMs > DEFAULT_WINDOW_MS) {
            windowStartMs = now
            events.clear()
        }
    }

    private fun enforceCapacity() {
        while (events.size > MAX_BUFFERED_EVENTS) {
            events.removeAt(0)
        }
    }

    sealed class MetricEvent {
        abstract val timestamp: Long
        data class Login(override val timestamp: Long, val email: String, val outcome: LoginOutcome) : MetricEvent()
        data class Logout(override val timestamp: Long, val userId: String) : MetricEvent()
        data class TokenRefresh(override val timestamp: Long, val userId: String, val success: Boolean) : MetricEvent()
        data class ValidationFailure(override val timestamp: Long, val reason: String) : MetricEvent()
    }
}

enum class LoginOutcome { Success, InvalidCredentials, NetworkError, Locked }

data class MetricsSummary(
    val windowStartMs: Long,
    val loginAttempts: Int,
    val loginSuccess: Int,
    val loginFailure: Int,
    val logouts: Int,
    val refreshSuccess: Int,
    val refreshFailure: Int,
    val validationFailures: Int,
)

/**
 * Intentionally large function used to exercise oversized-symbol chunker.
 * Real auth apps rarely have 200-line functions but they exist in legacy
 * code, and our outline must degrade gracefully rather than flood Claude's
 * context with one enormous body.
 */
fun processAuthBatch(
    events: List<AuthMetricsCollector.MetricEvent>,
    config: BatchConfig,
): BatchResult {
    val start = System.currentTimeMillis()
    var processed = 0
    var skipped = 0
    var failed = 0
    val byOutcome = mutableMapOf<LoginOutcome, Int>()
    val errors = mutableListOf<String>()

    for (event in events) {
        if (config.maxEvents > 0 && processed >= config.maxEvents) {
            skipped++
            continue
        }
        try {
            when (event) {
                is AuthMetricsCollector.MetricEvent.Login -> {
                    byOutcome.merge(event.outcome, 1) { a, b -> a + b }
                    processed++
                }
                is AuthMetricsCollector.MetricEvent.Logout -> {
                    processed++
                }
                is AuthMetricsCollector.MetricEvent.TokenRefresh -> {
                    if (!event.success && config.failOnRefreshError) {
                        failed++
                        errors += "token refresh failed for ${event.userId}"
                    } else {
                        processed++
                    }
                }
                is AuthMetricsCollector.MetricEvent.ValidationFailure -> {
                    if (config.includeValidationFailures) processed++ else skipped++
                }
            }
        } catch (e: Exception) {
            failed++
            errors += "event at ${event.timestamp}: ${e.message}"
        }
    }

    val duration = System.currentTimeMillis() - start
    return BatchResult(
        processed = processed,
        skipped = skipped,
        failed = failed,
        durationMs = duration,
        byOutcome = byOutcome,
        errors = errors,
    )
}

data class BatchConfig(
    val maxEvents: Int = 0,
    val failOnRefreshError: Boolean = false,
    val includeValidationFailures: Boolean = true,
)

data class BatchResult(
    val processed: Int,
    val skipped: Int,
    val failed: Int,
    val durationMs: Long,
    val byOutcome: Map<LoginOutcome, Int>,
    val errors: List<String>,
)
