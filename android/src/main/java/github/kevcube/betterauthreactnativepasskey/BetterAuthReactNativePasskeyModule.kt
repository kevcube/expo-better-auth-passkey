package github.kevcube.betterauthreactnativepasskey

import android.app.Activity
import androidx.credentials.*
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.net.URL

class BetterAuthReactNativePasskeyModule : Module() {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  override fun definition() = ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('BetterAuthReactNativePasskey')` in JavaScript.
    Name("BetterAuthReactNativePasskey")

    // Sets constant properties on the module. Can take a dictionary or a closure that returns a dictionary.
    Constants(
      "PI" to Math.PI
    )

    // Defines event names that the module can send to JavaScript.
    Events("onChange")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      "Hello world! 👋"
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("setValueAsync") { value: String ->
      // Send an event to JavaScript.
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }

    // Native passkey creation via Credential Manager
    AsyncFunction("createPasskey") { options: Map<String, Any> ->
      val activity: Activity = appContext.currentActivity
        ?: throw IllegalStateException("No current Activity available")
      val credentialManager = CredentialManager.create(activity)

      // Convert options map to JSON expected by Android Credentials API
      // Uses WebAuthn PublicKeyCredentialCreationOptions JSON
      val requestJson = JSONObject(options).toString()
      val request = CreatePublicKeyCredentialRequest(requestJson)

      try {
        val response = credentialManager.createCredential(activity, request)
        val cred = response.credential as PublicKeyCredential
        val registrationJson = cred.registrationResponseJson
        // Return parsed JSON back to JS
        JSONObject(registrationJson)
      } catch (e: CreateCredentialCancellationException) {
        throw e
      } catch (e: CreateCredentialException) {
        throw e
      }
    }

    // Native passkey authentication via Credential Manager
    AsyncFunction("getPasskey") { options: Map<String, Any> ->
      val activity: Activity = appContext.currentActivity
        ?: throw IllegalStateException("No current Activity available")
      val credentialManager = CredentialManager.create(activity)

      val requestJson = JSONObject(options).toString()
      val getOption = GetPublicKeyCredentialOption(requestJson)
      val getRequest = GetCredentialRequest(listOf(getOption))

      try {
        val response = credentialManager.getCredential(activity, getRequest)
        val cred = response.credential as PublicKeyCredential
        val authenticationJson = cred.authenticationResponseJson
        JSONObject(authenticationJson)
      } catch (e: GetCredentialCancellationException) {
        throw e
      } catch (e: GetCredentialException) {
        throw e
      }
    }

    // Enables the module to be used as a native view. Definition components that are accepted as part of
    // the view definition: Prop, Events.
    View(BetterAuthReactNativePasskeyView::class) {
      // Defines a setter for the `url` prop.
      Prop("url") { view: BetterAuthReactNativePasskeyView, url: URL ->
        view.webView.loadUrl(url.toString())
      }
      // Defines an event that the view can send to JavaScript.
      Events("onLoad")
    }
  }
}
