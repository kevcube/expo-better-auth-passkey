package github.kevcube.betterauthreactnativepasskey

import android.app.Activity
import androidx.credentials.*
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import kotlinx.coroutines.*
import org.json.JSONObject
import org.json.JSONArray

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
    AsyncFunction("createPasskey") { options: Map<String, Any>, promise: Promise ->
      val activity: Activity = appContext.currentActivity
        ?: throw IllegalStateException("No current Activity available")
      val credentialManager = CredentialManager.create(activity)

      // Convert options map to JSON expected by Android Credentials API
      // Uses WebAuthn PublicKeyCredentialCreationOptions JSON
      val requestJson = JSONObject(options).toString()
      val request = CreatePublicKeyCredentialRequest(requestJson)

      // Launch coroutine to handle suspend function
      CoroutineScope(Dispatchers.Main).launch {
        try {
          val result = credentialManager.createCredential(activity, request)
          when (result) {
            is CreatePublicKeyCredentialResponse -> {
              val registrationJson = result.registrationResponseJson
              // Parse and ensure transports field exists
              val jsonResult = JSONObject(registrationJson)
              val responseObj = jsonResult.getJSONObject("response")
              if (!responseObj.has("transports")) {
                responseObj.put("transports", JSONArray().put("internal"))
              }
              promise.resolve(jsonResult.toString())
            }
            else -> {
              promise.reject("INVALID_CREDENTIAL", "Unexpected credential type", null)
            }
          }
        } catch (e: CreateCredentialCancellationException) {
          promise.reject("CANCELLED", "User cancelled passkey creation", e)
        } catch (e: CreateCredentialException) {
          promise.reject("CREATE_ERROR", e.message ?: "Failed to create passkey", e)
        } catch (e: Exception) {
          promise.reject("UNKNOWN_ERROR", e.message ?: "Unknown error occurred", e)
        }
      }
    }

    // Native passkey authentication via Credential Manager
    AsyncFunction("getPasskey") { options: Map<String, Any>, promise: Promise ->
      val activity: Activity = appContext.currentActivity
        ?: throw IllegalStateException("No current Activity available")
      val credentialManager = CredentialManager.create(activity)

      val requestJson = JSONObject(options).toString()
      val getOption = GetPublicKeyCredentialOption(requestJson)
      val getRequest = GetCredentialRequest(listOf(getOption))

      // Launch coroutine to handle suspend function
      CoroutineScope(Dispatchers.Main).launch {
        try {
          val result = credentialManager.getCredential(activity, getRequest)
          val credential = result.credential
          when (credential) {
            is PublicKeyCredential -> {
              val authenticationJson = credential.authenticationResponseJson
              promise.resolve(authenticationJson)
            }
            else -> {
              promise.reject("INVALID_CREDENTIAL", "Unexpected credential type: ${credential.type}", null)
            }
          }
        } catch (e: GetCredentialCancellationException) {
          promise.reject("CANCELLED", "User cancelled passkey authentication", e)
        } catch (e: GetCredentialException) {
          promise.reject("GET_ERROR", e.message ?: "Failed to get passkey", e)
        } catch (e: Exception) {
          promise.reject("UNKNOWN_ERROR", e.message ?: "Unknown error occurred", e)
        }
      }
    }

  }
}
