package com.drinkgoodenergy.scan

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.Solana
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import com.solana.mobilewalletadapter.clientlib.protocol.MobileWalletAdapterClient.AuthorizationResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Runs the Scan the Can UI (the web/ folder, bundled as assets) in a WebView and
 * connects Solana wallets through Mobile Wallet Adapter.
 *
 * Web -> native: window.GoodEnergyNative.connect / disconnect / signClaim / share / currentWallet
 * Native -> web: window.GoodEnergyWallet.onConnected / onDisconnected / onError / onSigned / onSignFailed
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var sender: ActivityResultSender
    private val prefs by lazy { getSharedPreferences("wallet", MODE_PRIVATE) }
    private var busy = false

    // Wallets show this name and icon on their connect screen.
    private val walletAdapter = MobileWalletAdapter(
        connectionIdentity = ConnectionIdentity(
            identityUri = Uri.parse("https://drinkgoodenergy.com"),
            iconUri = Uri.parse("favicon.ico"),
            identityName = "Good Energy",
        )
    ).apply {
        // The app only connects and signs claim messages. It never sends a transaction.
        blockchain = Solana.Mainnet
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Has to exist before the activity starts. It registers for the wallet's result.
        sender = ActivityResultSender(this)
        walletAdapter.authToken = prefs.getString(KEY_TOKEN, null)

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            setBackgroundColor(NAVY)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false // so the chirp plays after the wallet hands back
            addJavascriptInterface(Bridge(), "GoodEnergyNative")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assets.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == ASSET_HOST) return false
                    // Outside links open in the browser.
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                    return true
                }
            }
        }

        setContentView(FrameLayout(this).apply {
            fitsSystemWindows = true
            setBackgroundColor(NAVY)
            addView(webView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        })

        webView.loadUrl(startUrl(intent))
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    /** goodenergy://scan?can=CODE opens the app and claims that can once. */
    private fun startUrl(intent: Intent?): String {
        val base = "https://$ASSET_HOST/assets/index.html"
        val code = intent?.data?.getQueryParameter("can")?.trim().orEmpty()
        return if (code.isEmpty()) base else base + "?can=" + Uri.encode(code)
    }

    // ---------- Mobile Wallet Adapter ----------

    private fun connectWallet() = runWallet(onFail = { js("onError", it) }) {
        when (val result = walletAdapter.connect(sender)) {
            is TransactionResult.Success -> {
                val address = remember(result.authResult)
                if (address == null) js("onError", "The wallet sent no account.")
                else js("onConnected", address, prefs.getString(KEY_LABEL, "").orEmpty())
            }
            is TransactionResult.NoWalletFound -> js("onError", NO_WALLET)
            is TransactionResult.Failure -> js("onError", "Wallet did not connect. " + result.message)
        }
    }

    private fun disconnectWallet() = runWallet(onFail = { forget(); js("onDisconnected") }) {
        if (walletAdapter.authToken != null) {
            walletAdapter.disconnect(sender) // asks the wallet to revoke this app's auth token
        }
        forget()
        js("onDisconnected")
    }

    private fun signClaimWithWallet(requestId: String, message: String) =
        runWallet(onFail = { js("onSignFailed", requestId, it) }) {
            val result = walletAdapter.transact(sender) { auth ->
                val key = accountKey(auth) ?: ByteArray(0)
                signMessagesDetached(arrayOf(message.toByteArray(Charsets.UTF_8)), arrayOf(key))
            }
            when (result) {
                is TransactionResult.Success -> {
                    val address = remember(result.authResult).orEmpty()
                    val signature = result.payload.messages.firstOrNull()?.signatures?.firstOrNull()
                    if (signature == null) js("onSignFailed", requestId, "The wallet sent no signature.")
                    else js("onSigned", requestId, Base58.encode(signature), address)
                }
                is TransactionResult.NoWalletFound -> js("onSignFailed", requestId, NO_WALLET)
                is TransactionResult.Failure -> js("onSignFailed", requestId, result.message)
            }
        }

    /** One wallet session at a time. Any error goes back to the web app instead of crashing. */
    private fun runWallet(onFail: (String) -> Unit, block: suspend () -> Unit) {
        if (busy) {
            onFail("The wallet is busy. Try again.")
            return
        }
        busy = true
        lifecycleScope.launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onFail("Wallet error: " + (e.message ?: e.javaClass.simpleName))
            } finally {
                busy = false
            }
        }
    }

    /** Saves the session so the wallet stays connected next launch. Returns the base58 address. */
    @Suppress("DEPRECATION")
    private fun remember(auth: AuthorizationResult): String? {
        val key = accountKey(auth) ?: return null
        val address = Base58.encode(key)
        val label = auth.accounts.firstOrNull()?.accountLabel ?: auth.accountLabel
        prefs.edit()
            .putString(KEY_TOKEN, walletAdapter.authToken ?: auth.authToken)
            .putString(KEY_ADDRESS, address)
            .putString(KEY_LABEL, label.orEmpty())
            .apply()
        return address
    }

    private fun forget() {
        walletAdapter.authToken = null
        prefs.edit().clear().apply()
    }

    @Suppress("DEPRECATION")
    private fun accountKey(auth: AuthorizationResult): ByteArray? =
        auth.accounts.firstOrNull()?.publicKey ?: auth.publicKey

    /** Calls window.GoodEnergyWallet.<fn>(...args) in the page. */
    private fun js(fn: String, vararg args: String) {
        val call = "window.GoodEnergyWallet && GoodEnergyWallet.$fn(" +
            args.joinToString(",") { JSONObject.quote(it) } + ")"
        webView.post { webView.evaluateJavascript(call, null) }
    }

    /** What the web app can call. These run on a WebView thread, so they hop to the main thread. */
    inner class Bridge {
        @JavascriptInterface
        fun connect() {
            runOnUiThread { connectWallet() }
        }

        @JavascriptInterface
        fun disconnect() {
            runOnUiThread { disconnectWallet() }
        }

        @JavascriptInterface
        fun signClaim(requestId: String, message: String) {
            runOnUiThread { signClaimWithWallet(requestId, message) }
        }

        @JavascriptInterface
        fun share(text: String) {
            runOnUiThread {
                val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
                startActivity(Intent.createChooser(send, "Share your cut"))
            }
        }

        @JavascriptInterface
        fun currentWallet(): String {
            val address = prefs.getString(KEY_ADDRESS, null)
            if (address == null || prefs.getString(KEY_TOKEN, null) == null) return ""
            return JSONObject()
                .put("address", address)
                .put("label", prefs.getString(KEY_LABEL, "").orEmpty())
                .toString()
        }
    }

    private companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val KEY_TOKEN = "auth_token"
        const val KEY_ADDRESS = "address"
        const val KEY_LABEL = "label"
        const val NO_WALLET = "No Solana wallet found. Install one that supports Mobile Wallet Adapter."
        val NAVY = Color.parseColor("#0F1923")
    }
}
