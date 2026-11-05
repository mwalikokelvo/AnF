// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.*
import java.util.UUID
import kotlinx.coroutines.*

/** Isolated native host. The production app does not register this service yet.
 * Only a foreground UI's explicitly prepared controller may be transferred here.
 * No URL intents, process restoration, exported binder or automatic catalog creation.
 */
class MkrPlaybackService : Service() {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private var request: Request?=null
    private var owner: AndroidMediaSession?=null
    private var remote: MediaController?=null
    private var closing=false
    private var destroyed=false
    private var cleaned=false
    private var bound=false
    private val terminated=CompletableDeferred<Unit>()
    private var initialization: Job?=null
    private val observer=object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?)=updateNotification()
        override fun onPlaybackStateChanged(state: PlaybackState?)=updateNotification()
    }
    @Suppress("DEPRECATION")
    override fun onBind(intent: Intent?): IBinder? {
        if(closing || intent?.action!=BIND || owner==null ||
            intent.getParcelableExtra<MediaSession.Token>(TOKEN)!=owner!!.token)return null
        bound=true;return NativeBinder(request!!.nonce)
    }
    override fun onUnbind(intent: Intent?): Boolean {bound=false;return true}
    override fun onRebind(intent: Intent?) {bound=true;super.onRebind(intent)}
    /** Same-process native API; no raw controller, source URL, player or credentials. */
    internal inner class NativeBinder(private val nonce: String) : Binder() {
        // Android may reuse a cached Binder without calling onBind again.
        fun matches(token: MediaSession.Token)=!closing && request?.nonce==nonce && owner?.token==token
        private fun current(): AndroidMediaSession {
            check(!closing && request?.nonce==nonce && owner!=null){"Music service unavailable."}
            return owner!!
        }
        suspend fun search(query: String)=withContext(Dispatchers.Main.immediate) {
            val session=current();val result=session.search(query)
            check(current()===session){"Music service unavailable."};result
        }
        suspend fun status()=withContext(Dispatchers.Main.immediate) {current().status()}
        suspend fun control(command: String, id: String?, positionMs: Long?)=withContext(Dispatchers.Main.immediate) {
            val session=current();val state=session.control(command,id,positionMs)
            check(current()===session){"Music service unavailable."};state
        }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if(intent?.action==START) {
            val next=pending
            if(!closing && request==null && next!=null && intent.getStringExtra(NONCE)==next.nonce) {
                pending=null;request=next;running=this
                try {
                    val manager=getSystemService(NotificationManager::class.java)
                    manager.createNotificationChannel(NotificationChannel(CHANNEL,"AnF Music",NotificationManager.IMPORTANCE_LOW).apply {
                        setSound(null,null);setShowBadge(false)
                    })
                    val notification=notification()
                    if(Build.VERSION.SDK_INT>=29) startForeground(NOTIFICATION,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
                    else startForeground(NOTIFICATION,notification)
                    initialization=scope.launch {
                        try {
                            withTimeout(8000) {
                                // Assignment happens on Main before another suspension, so destroy owns cleanup.
                                owner=AndroidMediaSession.create(this@MkrPlaybackService,next.controller)
                                owner!!.activate()
                                remote=MediaController(this@MkrPlaybackService,owner!!.token).also {
                                    it.registerCallback(observer,Handler(Looper.getMainLooper()))
                                }
                                updateNotification();next.ready.complete(owner!!.token)
                            }
                        } catch(error: CancellationException) {
                            next.ready.completeExceptionally(IllegalStateException("Music service unavailable."));finish()
                        } catch(error: Exception) {
                            next.ready.completeExceptionally(IllegalStateException("Music service unavailable."));finish()
                        }
                    }
                } catch(error: Exception) {
                    next.ready.completeExceptionally(IllegalStateException("Music service unavailable."));finish()
                }
            } else if(request==null) stopSelf(startId)
        } else if(!closing && request!=null && intent?.getStringExtra(NONCE)==request!!.nonce) {
            when(intent.action) {
                STOP -> finish()
                PLAY -> remote?.transportControls?.play()
                PAUSE -> remote?.transportControls?.pause()
                PREVIOUS -> remote?.transportControls?.skipToPrevious()
                NEXT -> remote?.transportControls?.skipToNext()
            }
        } else if(request==null) stopSelf(startId)
        return START_NOT_STICKY
    }
    private fun action(action: String): PendingIntent {
        val intent=Intent(this,MkrPlaybackService::class.java).setAction(action)
            .setData(Uri.parse("anf-mkr://session/${request!!.nonce}/$action"))
            .putExtra(NONCE,request!!.nonce)
        return PendingIntent.getService(this,0,intent,PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    private fun notification(): Notification {
        val playing=remote?.playbackState?.let {it.state==PlaybackState.STATE_PLAYING || it.state==PlaybackState.STATE_BUFFERING}?:false
        val metadata=remote?.metadata
        val builder=Notification.Builder(this,CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)?.take(256)?.takeIf{it.isNotBlank()}?:"AnF Music")
            .setContentText(metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST)?.take(256)?:"Ready to play")
            .setCategory(Notification.CATEGORY_TRANSPORT).setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true).setShowWhen(false).setOngoing(playing)
            .addAction(Notification.Action.Builder(android.R.drawable.ic_media_previous,"Previous",action(PREVIOUS)).build())
            .addAction(Notification.Action.Builder(if(playing)android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if(playing)"Pause" else "Play",action(if(playing)PAUSE else PLAY)).build())
            .addAction(Notification.Action.Builder(android.R.drawable.ic_media_next,"Next",action(NEXT)).build())
            .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Stop",action(STOP)).build())
            .setDeleteIntent(action(STOP))
        val style=Notification.MediaStyle().setShowActionsInCompactView(0,1,2)
        owner?.let {style.setMediaSession(it.token)}
        builder.setStyle(style)
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            builder.setContentIntent(PendingIntent.getActivity(this,0,it,PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        }
        return builder.build()
    }
    private fun updateNotification() {
        if(!closing && request!=null) getSystemService(NotificationManager::class.java).notify(NOTIFICATION,notification())
    }
    private fun finish() {
        if(closing)return
        closing=true;initialization?.cancel()
        // A fresh cleanup job is not cancelled with the service's command scope.
        scope.launch(NonCancellable) {
            try {
                remote?.unregisterCallback(observer);remote=null
                if(owner!=null) owner!!.close() else request?.controller?.close()
            } finally {
                request?.ready?.completeExceptionally(IllegalStateException("Music service stopped."))
                owner=null;request=null
                cleaned=true;clearDestroyedOwner()
                stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();scope.cancel()
            }
        }
    }
    private fun clearDestroyedOwner() {
        if(destroyed && cleaned) {
            if(running===this)running=null
            terminated.complete(Unit)
        }
    }
    override fun onDestroy() {destroyed=true;finish();clearDestroyedOwner();super.onDestroy()}
    companion object {
        private const val CHANNEL="anf-mkr-playback"
        internal const val NOTIFICATION=37041
        private const val NONCE="owner"
        private const val START="com.anf.mkr.START"
        internal const val BIND="com.anf.mkr.BIND"
        internal const val TOKEN="session"
        private const val STOP="com.anf.mkr.STOP"
        private const val PLAY="com.anf.mkr.PLAY"
        private const val PAUSE="com.anf.mkr.PAUSE"
        private const val NEXT="com.anf.mkr.NEXT"
        private const val PREVIOUS="com.anf.mkr.PREVIOUS"
        private class Request(val controller: AndroidPlaybackController) {
            val nonce=UUID.randomUUID().toString()
            val ready=CompletableDeferred<MediaSession.Token>()
        }
        // Accessed only on Main. No persisted controllers, URLs or credentials.
        private var pending: Request?=null
        private var running: MkrPlaybackService?=null
        internal suspend fun start(context: Context, controller: AndroidPlaybackController): MediaSession.Token =
            withContext(Dispatchers.Main.immediate) {
                val next=Request(controller)
                var submitted=false
                try {
                    // AMS can remove its running-service entry before this
                    // process receives onDestroy. Await that existing teardown
                    // after the final unbind; never start a competing owner.
                    running?.takeIf{it.closing && !it.bound}?.let {prior ->
                        withTimeout(8000){prior.terminated.await()}
                    }
                    check(pending==null && running==null){"Music service already owned."}
                    pending=next;submitted=true
                    context.applicationContext.startForegroundService(Intent(context,MkrPlaybackService::class.java)
                        .setAction(START).putExtra(NONCE,next.nonce))
                    withTimeout(10000){next.ready.await()}
                } finally {
                    // Cancellation before acceptance must release the prepared controller.
                    // Once claimed, the service owns playback independently of the Activity.
                    if(!submitted || pending===next) {
                        if(pending===next)pending=null
                        withContext(NonCancellable){controller.close()}
                    }
                }
            }
    }
}
