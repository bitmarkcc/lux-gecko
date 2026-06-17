package com.cookiejarapps.android.smartcookieweb.settings.fragment

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import com.cookiejarapps.android.smartcookieweb.BrowserActivity
import com.cookiejarapps.android.smartcookieweb.R
import com.cookiejarapps.android.smartcookieweb.ext.components

class CertimarkSettingsFragment : BaseSettingsFragment() {

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        addPreferencesFromResource(R.xml.preferences_certimark)
    }

    override fun onResume() {
        super.onResume()

        clickablePreference(
            preference = "certimark_open_options",
            onClick = { openCertimarkOptions() }
        )
    }

    private fun openCertimarkOptions() {
        val context = requireContext()

        context.components.engine.listInstalledWebExtensions(
            onSuccess = { extensions ->
                val certimark = extensions.find { it.id == "certimark@certimark.cc" }
                val optionsUrl = certimark?.getMetadata()?.optionsPageUrl

                activity?.runOnUiThread {
                    if (optionsUrl != null) {
                        context.components.tabsUseCases.addTab(optionsUrl, selectTab = true)
                        val intent = Intent(context, BrowserActivity::class.java)
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                        context.startActivity(intent)
                    } else if (certimark != null) {
                        // Extension found but no options URL - open its base URL + options.html
                        val baseUrl = certimark.url
                        val url = if (baseUrl.endsWith("/")) "${baseUrl}options.html" else "$baseUrl/options.html"
                        context.components.tabsUseCases.addTab(url, selectTab = true)
                        val intent = Intent(context, BrowserActivity::class.java)
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                        context.startActivity(intent)
                    } else {
                        Toast.makeText(context, "Certimark extension not installed", Toast.LENGTH_SHORT).show()
                    }
                }
            },
            onError = { throwable ->
                activity?.runOnUiThread {
                    Toast.makeText(context, "Error: ${throwable.message}", Toast.LENGTH_SHORT).show()
                }
            }
        )
    }
}
