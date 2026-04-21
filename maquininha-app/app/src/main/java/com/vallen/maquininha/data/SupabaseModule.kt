package com.vallen.maquininha.data

import com.vallen.maquininha.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage
import kotlin.time.Duration.Companion.seconds

object SupabaseModule {
    lateinit var client: SupabaseClient
        private set

    fun init() {
        client = createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY
        ) {
            // Emulador pode levar >10s no 1º handshake TLS
            requestTimeout = 60.seconds
            install(Auth)
            install(Postgrest)
            install(Realtime)
            install(Storage)
        }
    }
}
