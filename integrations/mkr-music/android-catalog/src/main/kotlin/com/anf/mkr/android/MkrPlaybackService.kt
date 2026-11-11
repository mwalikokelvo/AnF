// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.ComponentName
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
    private var foreground=false
    private var destroyed=false
    private var cleaned=false
    private var clients=0
    private val terminated=CompletableDeferred<Unit>()
    private var initialization: Job?=null
    private var promotion: CompletableDeferred<Unit>?=null
    private val observer=object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?)=updateNotification()
        override fun onPlaybackStateChanged(state: PlaybackState?)=updateNotification()
    }
    @Suppress("DEPRECATION")
    override fun onBind(intent: Intent?): IBinder? {
        if(!closing && intent?.action==PREPARE) {
            val next=pending
            if(request==null && next!=null && next.preparedOnly && intent.getStringExtra(NONCE)==next.nonce) {
                initialize(next,foregroundOnStart=false)
                return NativeBinder(next.nonce)
            }
            return null
        }
        if(closing || intent?.action!=BIND || owner==null ||
            intent.getParcelableExtra<MediaSession.Token>(TOKEN)!=owner!!.token)return null
        return NativeBinder(request!!.nonce)
    }
    override fun onUnbind(intent: Intent?): Boolean {
        // PREPARE and BIND publish separate interfaces. Dropping the bootstrap
        // interface must not close an already retained native browsing lease.
        if(request?.preparedOnly==true)queueIdleCleanup()
        else if(!foreground && clients==0)finish()
        return true
    }
    /** Same-process native API; no raw controller, source URL, player or credentials. */
    internal inner class NativeBinder(private val nonce: String) : Binder() {
        // Android may reuse a cached Binder without calling onBind again.
        fun matches(token: MediaSession.Token)=!closing && request?.nonce==nonce && owner?.token==token
        fun retain(token: MediaSession.Token): Boolean {
            check(Looper.myLooper()==Looper.getMainLooper())
            if(!matches(token))return false
            clients++;return true
        }
        fun release() {
            check(Looper.myLooper()==Looper.getMainLooper());check(clients>0);clients--
            if(clients==0 && request?.preparedOnly==true)queueIdleCleanup()
        }
        suspend fun preparedToken(approval: String): MediaSession.Token = withContext(Dispatchers.Main.immediate) {
            check(!closing && request?.nonce==nonce && approval==nonce && request?.preparedOnly==true){"Music preparation unavailable."}
            val token=request!!.ready.await()
            check(!closing && request?.nonce==nonce && owner?.token==token){"Music preparation unavailable."}
            token
        }
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
        suspend fun playPrepared(id: String?)=withContext(Dispatchers.Main.immediate) {
            val session=current()
            check(request?.preparedOnly==true){"Music preparation unavailable."}
            val state=session.playPrepared(id)
            check(current()===session){"Music service unavailable."};state
        }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if(intent?.action==START) {
            val next=pending
            if(!closing && request==null && next!=null && !next.preparedOnly && intent.getStringExtra(NONCE)==next.nonce) {
                initialize(next,foregroundOnStart=true)
            } else if(request==null) stopSelf(startId)
        } else if(!closing && request!=null && intent?.getStringExtra(NONCE)==request!!.nonce) {
            when(intent.action) {
                PROMOTE -> if(request!!.preparedOnly && owner!=null) {
                    try {
                        enterForeground();promotion?.complete(Unit)
                        scope.launch {owner?.refresh()}
                        queueIdleCleanup()
                    } catch(error: Exception) {
                        promotion?.completeExceptionally(IllegalStateException("Music playback unavailable."));finish()
                    }
                }
                STOP -> finish()
                PLAY -> remote?.transportControls?.play()
                PAUSE -> remote?.transportControls?.pause()
                PREVIOUS -> remote?.transportControls?.skipToPrevious()
                NEXT -> remote?.transportControls?.skipToNext()
            }
        } else if(request==null) stopSelf(startId)
        return START_NOT_STICKY
    }
    private fun initialize(next: Request, foregroundOnStart: Boolean) {
        pending=null;request=next;next.claimed=true;running=this
        try {
            if(foregroundOnStart)enterForeground()
            initialization=scope.launch {
                try {
                    withTimeout(8000) {
                        if(next.preparedOnly)next.controller.installStartGate({promote()},{queueIdleCleanup()})
                        owner=AndroidMediaSession.create(this@MkrPlaybackService,next.controller,playbackAllowed={foreground})
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
    }
    private fun enterForeground() {
        if(foreground)return
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL,"AnF Music",NotificationManager.IMPORTANCE_LOW).apply {
            setSound(null,null);setShowBadge(false)
        })
        val notification=notification()
        if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(NOTIFICATION,notification)
        foreground=true
    }
    /** Invoked only after controller selection validation and a positive audio handoff. */
    private suspend fun promote()=withContext(Dispatchers.Main.immediate) {
        check(!closing && request?.preparedOnly==true && owner!=null){"Music preparation unavailable."}
        if(!foreground) {
            val receipt=promotion ?: CompletableDeferred<Unit>().also {
                promotion=it
                try {
                    applicationContext.startForegroundService(Intent(this@MkrPlaybackService,MkrPlaybackService::class.java)
                        .setAction(PROMOTE).putExtra(NONCE,request!!.nonce))
                } catch(error: Exception) {
                    it.completeExceptionally(IllegalStateException("Music playback unavailable."));finish()
                }
            }
            withTimeout(4000){receipt.await()}
        }
        check(!closing && foreground){"Music playback unavailable."}
    }
    private fun queueIdleCleanup() {
        scope.launch {
            val next=request
            if(!closing && next?.preparedOnly==true && clients==0 &&
                !next.controller.hasActivePlayback && !next.controller.hasStartedPlayback &&
                promotion?.isCompleted!=false)finish()
        }
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
        if(!closing && foreground && request!=null) getSystemService(NotificationManager::class.java).notify(NOTIFICATION,notification())
    }
    private fun finish() {
        if(closing)return
        closing=true;initialization?.cancel()
        promotion?.completeExceptionally(IllegalStateException("Music service stopped."))
        // The service scope stays active until this child completes cleanup.
        // Protect cleanup itself, retaining the child's structured parent.
        scope.launch { withContext(NonCancellable) {
            try {
                remote?.unregisterCallback(observer);remote=null
                if(owner!=null) owner!!.close() else request?.controller?.close()
            } finally {
                request?.ready?.completeExceptionally(IllegalStateException("Music service stopped."))
                owner=null;request=null
                cleaned=true;clearDestroyedOwner()
                if(foreground){stopForeground(STOP_FOREGROUND_REMOVE);foreground=false}
                stopSelf();scope.cancel()
            }
        }}
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
        private const val PREPARE="com.anf.mkr.PREPARE"
        private const val PROMOTE="com.anf.mkr.PROMOTE"
        internal const val TOKEN="session"
        private const val STOP="com.anf.mkr.STOP"
        private const val PLAY="com.anf.mkr.PLAY"
        private const val PAUSE="com.anf.mkr.PAUSE"
        private const val NEXT="com.anf.mkr.NEXT"
        private const val PREVIOUS="com.anf.mkr.PREVIOUS"
        private class Request(val controller: AndroidPlaybackController, val preparedOnly: Boolean=false) {
            var claimed=false // Main only: accepted controller belongs to the service.
            val nonce=UUID.randomUUID().toString()
            val ready=CompletableDeferred<MediaSession.Token>()
        }
        // Accessed only on Main. No persisted controllers, URLs or credentials.
        private var pending: Request?=null
        private var running: MkrPlaybackService?=null
        internal suspend fun reconnectPrepared(context: Context, token: MediaSession.Token): AndroidMkrPreparedConnection? {
            // Inspect only on Main; do not start an empty service to probe a stale token.
            val reusable=withContext(Dispatchers.Main.immediate) {
                running?.let{!it.closing && it.request?.preparedOnly==true && it.owner?.token==token}==true
            }
            if(!reusable)return null
            // No outer dispatcher return hop: connect already closes a lease if
            // its caller's dispatcher is cancelled during successful delivery.
            return AndroidMkrPreparedConnection(AndroidMkrConnection.connect(context.applicationContext,token))
        }
        internal suspend fun prepare(context: Context, controller: AndroidPlaybackController): AndroidMkrPreparedConnection {
            val next=Request(controller,preparedOnly=true)
            var prepared: AndroidMkrPreparedConnection?=null
            try {return withContext(Dispatchers.Main.immediate) {coroutineScope {
                awaitVacant();pending=next
                val app=context.applicationContext
                val ready=CompletableDeferred<MediaSession.Token>()
                var validating: Job?=null
                var active=true
                var registered=false
                fun unavailable(){ready.completeExceptionally(IllegalStateException("Music preparation unavailable."))}
                val connection=object : ServiceConnection {
                    override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                        if(!active)return
                        val local=service as? NativeBinder
                        if(local==null){unavailable();return}
                        validating=launch {
                            try {ready.complete(local.preparedToken(next.nonce))}
                            catch(error: Exception){unavailable()}
                        }
                    }
                    override fun onServiceDisconnected(name: ComponentName?)=unavailable()
                    override fun onBindingDied(name: ComponentName?)=unavailable()
                    override fun onNullBinding(name: ComponentName?)=unavailable()
                }
                try {
                    registered=app.bindService(Intent(app,MkrPlaybackService::class.java).setAction(PREPARE)
                        .putExtra(NONCE,next.nonce),connection,Context.BIND_AUTO_CREATE)
                    check(registered){"Music preparation unavailable."}
                    val token=withTimeout(5000){ready.await()}
                    val result=AndroidMkrPreparedConnection(AndroidMkrConnection.connect(app,token))
                    prepared=result;result
                } finally {
                    active=false;validating?.cancel();ready.cancel()
                    if(registered)app.unbindService(connection)
                }
            }}} catch(error: Exception) {
                // Covers cancellation before Main starts and cancelled delivery
                // after a fully prepared lease was queued to the caller.
                val obtained=prepared
                if(obtained!=null) {
                    // The service already owns this controller. Closing its
                    // native lease schedules detach on Main; no second dispatcher
                    // round trip is needed just to check the accepted request.
                    obtained.close()
                } else withContext(NonCancellable+Dispatchers.Main.immediate) {
                    if(!next.claimed){if(pending===next)pending=null;controller.close()}
                }
                throw error
            }
        }
        private suspend fun awaitVacant() {
            running?.takeIf{it.closing && it.clients==0}?.let {prior ->withTimeout(8000){prior.terminated.await()}}
            check(pending==null && running==null){"Music service already owned."}
        }
        internal suspend fun start(context: Context, controller: AndroidPlaybackController): MediaSession.Token =
            withContext(Dispatchers.Main.immediate) {
                val next=Request(controller)
                var submitted=false
                try {
                    // AMS can remove its running-service entry before this
                    // process receives onDestroy. Await that existing teardown
                    // after the final unbind; never start a competing owner.
                    // onUnbind can lag both the caller's unbindService and AMS's
                    // service-list removal. Count native handles synchronously;
                    // a genuinely retained stopped owner must still reject start.
                    awaitVacant()
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
