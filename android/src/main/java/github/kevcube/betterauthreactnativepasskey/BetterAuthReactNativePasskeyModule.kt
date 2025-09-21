package github.kevcube.betterauthreactnativepasskey

import android.app.Activity
import androidx.credentials.*
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject

class BetterAuthReactNativePasskeyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BetterAuthReactNativePasskey")

    AsyncFunction("registerPasskey") { options: Map<String, Any?>, _: Boolean?, promise: Promise ->
      val activity: Activity = appContext.currentActivity ?: run {
        promise.reject("NO_ACTIVITY", "No current Activity available", null)
        return@AsyncFunction
      }

      val optionsJson = JSONObject(options["optionsJSON"] as Map<String, Any?>).toString()
      val rpId = (options["optionsJSON"] as Map<String, Any?>)
        .let { it["rp"] as Map<String, Any?> }
        .let { it["id"] as String }

      CoroutineScope(Dispatchers.Main).launch {
        try {
          val credentialManager = CredentialManager.create(activity)
          val request = CreatePublicKeyCredentialRequest(optionsJson)
          val result = credentialManager.createCredential(activity, request)

          when (result) {
            is CreatePublicKeyCredentialResponse -> {
              val response = JSONObject(result.registrationResponseJson)

              // Add missing transports and set web origin
              response.getJSONObject("response").apply {
                if (!has("transports")) put("transports", JSONArray().put("internal"))
              }
              response.put("origin", "https://$rpId")

              promise.resolve(response.toMap())
            }
            else -> promise.reject("UNEXPECTED_TYPE", "Unexpected credential type", null)
          }
        } catch (e: CreateCredentialCancellationException) {
          promise.reject("CANCELLED", "User cancelled", e)
        } catch (e: CreateCredentialException) {
          promise.reject("CREATE_ERROR", e.message ?: "Failed to create passkey", e)
        } catch (e: Exception) {
          promise.reject("UNKNOWN_ERROR", e.message ?: "Unknown error", e)
        }
      }
    }

    AsyncFunction("authenticatePasskey") { options: Map<String, Any?>, _: Boolean?, promise: Promise ->
      val activity: Activity = appContext.currentActivity ?: run {
        promise.reject("NO_ACTIVITY", "No current Activity available", null)
        return@AsyncFunction
      }

      val optionsJson = JSONObject(options["optionsJSON"] as Map<String, Any?>).toString()
      val rpId = (options["optionsJSON"] as Map<String, Any?>)["rpId"] as String

      CoroutineScope(Dispatchers.Main).launch {
        try {
          val credentialManager = CredentialManager.create(activity)
          val getOption = GetPublicKeyCredentialOption(optionsJson)
          val getRequest = GetCredentialRequest(listOf(getOption))
          val result = credentialManager.getCredential(activity, getRequest)

          when (val credential = result.credential) {
            is PublicKeyCredential -> {
              val response = JSONObject(credential.authenticationResponseJson)
              response.put("origin", "https://$rpId")
              promise.resolve(response.toMap())
            }
            else -> promise.reject("UNEXPECTED_TYPE", "Unexpected credential type: ${credential.type}", null)
          }
        } catch (e: GetCredentialCancellationException) {
          promise.reject("CANCELLED", "User cancelled", e)
        } catch (e: GetCredentialException) {
          promise.reject("GET_ERROR", e.message ?: "Failed to get passkey", e)
        } catch (e: Exception) {
          promise.reject("UNKNOWN_ERROR", e.message ?: "Unknown error", e)
        }
      }
    }
  }
}

// Simple JSONObject to Map conversion using Expo's built-in serialization
private fun JSONObject.toMap(): Map<String, Any?> {
  val map = mutableMapOf<String, Any?>()
  keys().forEach { key ->
    map[key] = when (val value = get(key)) {
      is JSONObject -> value.toMap()
      is JSONArray -> value.toList()
      JSONObject.NULL -> null
      else -> value
    }
  }
  return map
}

private fun JSONArray.toList(): List<Any?> {
  val list = mutableListOf<Any?>()
  for (i in 0 until length()) {
    list.add(when (val value = get(i)) {
      is JSONObject -> value.toMap()
      is JSONArray -> value.toList()
      JSONObject.NULL -> null
      else -> value
    })
  }
  return list
}