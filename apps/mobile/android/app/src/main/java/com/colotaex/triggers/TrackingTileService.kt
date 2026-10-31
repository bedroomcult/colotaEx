/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.colotaex.triggers

import android.content.Context
import android.graphics.drawable.Icon
import android.os.Handler
import android.os.Looper
import android.service.quicksettings.TileService
import android.widget.Toast
import com.colotaex.R
import com.colotaex.service.LocationForegroundService
import com.colotaex.service.NotificationHelper
import com.colotaex.util.AppLanguage
import com.colotaex.util.AppLogger

/**
 * Quick Settings toggle tile for ColotaEx tracking.
 *
 * Tap starts tracking when stopped, stops tracking when started. Tile state
 * (ACTIVE / INACTIVE) reflects [LocationForegroundService.isStarted] and re-syncs
 * in [onStartListening] whenever the tile panel opens. A single toggle tile is
 * used rather than two separate start/stop tiles, matching the existing app
 * shortcut and automation-intent patterns.
 */
class TrackingTileService : TileService() {

    companion object {
        private const val TAG = "TrackingTileService"
        private const val STATE_ACTIVE = 2     // Tile.STATE_ACTIVE
        private const val STATE_INACTIVE = 1   // Tile.STATE_INACTIVE

        /** Exposed for the unit test: the tile state that matches a running/stopped service. */
        internal fun tileState(isRunning: Boolean): Int = if (isRunning) STATE_ACTIVE else STATE_INACTIVE
    }

    override fun onStartListening() {
        super.onStartListening()
        // Unbound in the window before the system binds the tile; nothing to paint yet.
        val tile = qsTile ?: return
        val active = LocationForegroundService.isStarted
        tile.state = tileState(active)
        tile.icon = Icon.createWithResource(
            this,
            if (active) R.drawable.ic_tile_tracking_active else R.drawable.ic_tile_tracking
        )
        tile.updateTile()
    }

    override fun onClick() {
        super.onClick()
        val appContext = applicationContext
        try {
            if (LocationForegroundService.isStarted) {
                AppLogger.d(TAG, "Tile: stop tracking")
                TrackingControl.stop(appContext, NotificationHelper.StopReason.TILE)
                toastOnMain(appContext, AppLanguage.context(appContext).getString(R.string.toast_tracking_stopped))
            } else {
                AppLogger.d(TAG, "Tile: start tracking")
                TrackingControl.start(appContext, "Started via quick settings tile")
                toastOnMain(appContext, AppLanguage.context(appContext).getString(R.string.toast_tracking_started))
            }
        } catch (e: Exception) {
            // A background FGS start can throw on Android 12+; an uncaught throw here would
            // take the app down from the notification shade.
            AppLogger.e(TAG, "Tile toggle failed", e)
        }
    }

    private fun toastOnMain(context: Context, message: String) {
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }
}
