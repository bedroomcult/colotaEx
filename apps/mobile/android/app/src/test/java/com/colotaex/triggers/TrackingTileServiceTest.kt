/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.colotaex.triggers

import android.app.Application
import android.os.Looper
import android.service.quicksettings.Tile
import com.colotaex.service.LocationForegroundService
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ServiceController
import org.robolectric.shadows.ShadowToast

/**
 * Mirrors [TrackingControlTest]: exercises the tile's toggle behaviour through
 * [TrackingControl] and verifies the stop reason is [NotificationHelper.StopReason.TILE].
 */
@RunWith(RobolectricTestRunner::class)
class TrackingTileServiceTest {

    private lateinit var controller: ServiceController<TrackingTileService>
    private lateinit var app: Application

    @Before
    fun setUp() {
        setIsStarted(false)
        app = RuntimeEnvironment.getApplication()
        controller = Robolectric.buildService(TrackingTileService::class.java)
        controller.create()
    }

    @Test
    fun `tile state maps to ACTIVE when the service runs and INACTIVE when it does not`() {
        assertEquals(Tile.STATE_ACTIVE, TrackingTileService.tileState(true))
        assertEquals(Tile.STATE_INACTIVE, TrackingTileService.tileState(false))
    }

    @Test
    fun `onClick when stopped starts the foreground service`() {
        setIsStarted(false)
        controller.get().onClick()

        val started = shadowOf(app).nextStartedService
        assertNotNull("expected a started service", started)
        assertEquals(LocationForegroundService::class.java.name, started.component?.className)
    }

    @Test
    fun `onClick when started stops with TILE reason`() {
        setIsStarted(true)
        controller.get().onClick()

        val stopped = shadowOf(app).nextStartedService
        assertNotNull("expected a stop service intent", stopped)
        assertEquals(LocationForegroundService.ACTION_STOP_REQUEST, stopped.action)
        assertEquals("TILE", stopped.getStringExtra(LocationForegroundService.EXTRA_STOP_REASON))
    }

    @Test
    fun `onClick shows a start toast when stopped and a stop toast when started`() {
        val startedText = app.getString(com.colotaex.R.string.toast_tracking_started)
        val stoppedText = app.getString(com.colotaex.R.string.toast_tracking_stopped)

        setIsStarted(false)
        controller.get().onClick()
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(startedText, ShadowToast.getTextOfLatestToast())

        setIsStarted(true)
        controller.get().onClick()
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(stoppedText, ShadowToast.getTextOfLatestToast())
    }

    private fun setIsStarted(started: Boolean) {
        val field = LocationForegroundService::class.java.getDeclaredField("isStarted")
        field.isAccessible = true
        field.set(null, started)
    }
}