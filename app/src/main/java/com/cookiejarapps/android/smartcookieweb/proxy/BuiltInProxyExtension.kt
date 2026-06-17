package com.cookiejarapps.android.smartcookieweb.proxy

import mozilla.components.concept.engine.webextension.WebExtensionRuntime
import mozilla.components.support.base.log.logger.Logger

/**
 * Installs the built-in Lux Proxy WebExtension, which routes traffic through a
 * SOCKS proxy (Tor by default) via the proxy.onRequest API. The extension is
 * self-contained: it stores its configuration in browser.storage and is
 * configured from its own popup.
 */
object BuiltInProxyExtension {
    const val ID = "luxproxy@lux"
    private const val URL = "resource://android/assets/extensions/luxproxy/"

    private val logger = Logger("BuiltInProxyExtension")

    fun install(runtime: WebExtensionRuntime) {
        runtime.installBuiltInWebExtension(
            id = ID,
            url = URL,
            onSuccess = { logger.info("Lux Proxy extension installed") },
            onError = { throwable -> logger.error("Failed to install Lux Proxy extension", throwable) }
        )
    }
}
