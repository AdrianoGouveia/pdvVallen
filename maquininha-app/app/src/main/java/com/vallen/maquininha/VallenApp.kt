package com.vallen.maquininha

import android.app.Application
import com.vallen.maquininha.data.Prefs
import com.vallen.maquininha.data.SupabaseModule

class VallenApp : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
        SupabaseModule.init()
        Prefs.init(this)
    }

    companion object {
        lateinit var instance: VallenApp
            private set
    }
}
