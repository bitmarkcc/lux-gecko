package com.cookiejarapps.android.smartcookieweb

import android.util.Log
import android.view.View
import com.cookiejarapps.android.smartcookieweb.browser.toolbar.ToolbarGestureHandler
import com.cookiejarapps.android.smartcookieweb.browser.toolbar.WebExtensionToolbarFeature
import com.cookiejarapps.android.smartcookieweb.databinding.FragmentBrowserBinding
import com.cookiejarapps.android.smartcookieweb.ext.components
import com.cookiejarapps.android.smartcookieweb.preferences.UserPreferences
import kotlinx.coroutines.ExperimentalCoroutinesApi
import mozilla.components.browser.state.state.SessionState
import mozilla.components.browser.thumbnails.BrowserThumbnails
import mozilla.components.feature.tabs.WindowFeature
import mozilla.components.support.base.feature.UserInteractionHandler
import mozilla.components.support.base.feature.ViewBoundFeatureWrapper

/**
 * Fragment used for browsing the web within the main app.
 */
@ExperimentalCoroutinesApi
@Suppress("TooManyFunctions", "LargeClass")
class BrowserFragment : BaseBrowserFragment(), UserInteractionHandler {

    private var _binding: FragmentBrowserBinding? = null

    private val windowFeature = ViewBoundFeatureWrapper<WindowFeature>()
    private val webExtToolbarFeature = ViewBoundFeatureWrapper<WebExtensionToolbarFeature>()

    @Suppress("LongMethod")
    override fun initializeUI(view: View, tab: SessionState) {
        super.initializeUI(view, tab)

        val context = requireContext()
        val components = context.components

        binding.gestureLayout.addGestureListener(
            ToolbarGestureHandler(
                activity = requireActivity(),
                contentLayout = binding.browserLayout,
                tabPreview = binding.tabPreview,
                toolbarLayout = browserToolbarView.view,
                store = components.store,
                selectTabUseCase = components.tabsUseCases.selectTab
            )
        )

        thumbnailsFeature.set(
            feature = BrowserThumbnails(context, binding.engineView, components.store),
            owner = this,
            view = view
        )

        // Always show Certimark in the toolbar; additionally show user-selected addons.
        // Proxy Settings is intentionally not shown here — it's reachable from the menu.
        val builtInAddons = listOf("certimark@certimark.cc")
        val userList = UserPreferences(requireContext()).barAddonsList
            .split(",")
            .filter { it.isNotEmpty() }
        val addonsList = builtInAddons + userList.filter { it !in builtInAddons }

        webExtToolbarFeature.set(
            feature = WebExtensionToolbarFeature(
                browserToolbarView.view,
                components.store,
                addonsList,
            ),
            owner = this,
            view = view
        )

        windowFeature.set(
            feature = WindowFeature(
                store = components.store,
                tabsUseCases = components.tabsUseCases
            ),
            owner = this,
            view = view
        )
    }
}