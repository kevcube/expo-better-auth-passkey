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
        // Parse and ensure transports field exists
        val result = JSONObject(registrationJson)
        val responseObj = result.getJSONObject("response")
        if (!responseObj.has("transports")) {
          responseObj.put("transports", org.json.JSONArray().put("internal"))
        }
        result
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

  }
}
