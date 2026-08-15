package github.kevcube.betterauthreactnativepasskey

import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class BetterAuthReactNativePasskeyModule : Module() {
  private val job = SupervisorJob()
  private val scope = CoroutineScope(SupervisorJob(job) + Dispatchers.Main)

  override fun definition() = ModuleDefinition {
    Name("BetterAuthReactNativePasskey")

    OnDestroy {
      job.cancel()
    }

    AsyncFunction("registerPasskey") { payload: Map<String, Any?>, promise: Promise ->
      val activity: Activity = appContext.currentActivity ?: run {
        promise.reject("NO_ACTIVITY", "No current Activity available", null)
        return@AsyncFunction
      }

      val optionsJsonObject = parseOptions(payload["optionsJSON"]) ?: run {
        promise.reject("INVALID_OPTIONS", "optionsJSON must be an object", null)
        return@AsyncFunction
      }

      optionsJsonObject.optJSONObject("user")?.let { userObject ->
        val passkeyNickname = userObject.optString("name")
        if (passkeyNickname.isNotEmpty()) {
          userObject.put("displayName", passkeyNickname)
        }
      }

      val rpId = optionsJsonObject.optJSONObject("rp")?.optString("id").orEmpty()
      if (rpId.isBlank()) {
        promise.reject("INVALID_OPTIONS", "rp.id is required", null)
        return@AsyncFunction
      }

      val useAutoRegister = payload["useAutoRegister"] as? Boolean ?: false
      val origin = "https://$rpId"
      val originForRequest = origin.takeIf { canUseSetOrigin(activity) }

      scope.launch {
        try {
          val credentialManager = CredentialManager.create(activity)
          val request = buildCreatePublicKeyCredentialRequest(
            optionsJson = optionsJsonObject.toString(),
            origin = originForRequest,
            preferImmediatelyAvailable = useAutoRegister,
            autoSelectAllowed = useAutoRegister,
          )
          val result = credentialManager.createCredential(activity, request)

          when (result) {
            is CreatePublicKeyCredentialResponse -> {
              val response = JSONObject(result.registrationResponseJson)
              response.getJSONObject("response").apply {
                if (!has("transports")) {
                  put("transports", JSONArray().put("internal"))
                }
              }
              response.put("origin", origin)
              promise.resolve(response.toMap())
            }
            else -> promise.reject("UNEXPECTED_TYPE", "Unexpected credential type", null)
          }
        } catch (e: CreateCredentialCancellationException) {
          promise.reject("ERROR_CEREMONY_ABORTED", e.message ?: "User cancelled", e)
        } catch (e: CreatePublicKeyCredentialDomException) {
          val message = e.message ?: "Failed to create passkey"
          val code = if (
            message.contains("InvalidStateError", ignoreCase = true) ||
            message.contains("exclude", ignoreCase = true)
          ) {
            "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"
          } else {
            "CREATE_ERROR"
          }
          promise.reject(code, message, e)
        } catch (e: CreateCredentialException) {
          promise.reject("CREATE_ERROR", e.message ?: "Failed to create passkey", e)
        } catch (e: Exception) {
          promise.reject("UNKNOWN_ERROR", e.message ?: "Unknown error", e)
        }
      }
    }

    AsyncFunction("authenticatePasskey") { payload: Map<String, Any?>, promise: Promise ->
      val activity: Activity = appContext.currentActivity ?: run {
        promise.reject("NO_ACTIVITY", "No current Activity available", null)
        return@AsyncFunction
      }

      val optionsJsonObject = parseOptions(payload["optionsJSON"]) ?: run {
        promise.reject("INVALID_OPTIONS", "optionsJSON must be an object", null)
        return@AsyncFunction
      }

      val rpId = optionsJsonObject.optString("rpId")
      if (rpId.isNullOrBlank()) {
        promise.reject("INVALID_OPTIONS", "rpId is required", null)
        return@AsyncFunction
      }

      val useAutofill = payload["useAutofill"] as? Boolean ?: false
      val origin = "https://$rpId"
      val originForRequest = origin.takeIf { canUseSetOrigin(activity) }

      scope.launch {
        try {
          val credentialManager = CredentialManager.create(activity)
          val getOption = GetPublicKeyCredentialOption(optionsJsonObject.toString())
          val getRequest = buildGetCredentialRequest(
            option = getOption,
            origin = originForRequest,
            preferImmediatelyAvailable = useAutofill,
          )
          val result = credentialManager.getCredential(activity, getRequest)

          when (val credential = result.credential) {
            is PublicKeyCredential -> {
              val response = JSONObject(credential.authenticationResponseJson)
              response.put("origin", origin)
              promise.resolve(response.toMap())
            }
            else -> promise.reject("UNEXPECTED_TYPE", "Unexpected credential type: ${credential.type}", null)
          }
        } catch (e: GetCredentialCancellationException) {
          promise.reject("ERROR_CEREMONY_ABORTED", e.message ?: "User cancelled", e)
        } catch (e: GetCredentialException) {
          promise.reject("GET_ERROR", e.message ?: "Failed to get passkey", e)
        } catch (e: Exception) {
          promise.reject("UNKNOWN_ERROR", e.message ?: "Unknown error", e)
        }
      }
    }
  }
}

private fun parseOptions(raw: Any?): JSONObject? = when (raw) {
  is JSONObject -> raw
  is String -> runCatching { JSONObject(raw) }.getOrNull()
  is Map<*, *> -> raw.toJsonObject()
  else -> null
}

private fun Map<*, *>.toJsonObject(): JSONObject {
  val obj = JSONObject()
  for ((key, value) in this) {
    if (key is String) {
      obj.put(key, value.toJsonValue())
    }
  }
  return obj
}

private fun Any?.toJsonValue(): Any = when (this) {
  null -> JSONObject.NULL
  is JSONObject, is JSONArray -> this
  is Map<*, *> -> this.toJsonObject()
  is Collection<*> -> JSONArray().also { array ->
    for (item in this) {
      array.put(item.toJsonValue())
    }
  }
  is Array<*> -> JSONArray().also { array ->
    for (item in this) {
      array.put(item.toJsonValue())
    }
  }
  JSONObject.NULL -> JSONObject.NULL
  else -> this
}

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
    list.add(
      when (val value = get(i)) {
        is JSONObject -> value.toMap()
        is JSONArray -> value.toList()
        JSONObject.NULL -> null
        else -> value
      }
    )
  }
  return list
}

private fun buildCreatePublicKeyCredentialRequest(
  optionsJson: String,
  origin: String?,
  preferImmediatelyAvailable: Boolean,
  autoSelectAllowed: Boolean,
): CreatePublicKeyCredentialRequest {
  return try {
    CreatePublicKeyCredentialRequest(
      optionsJson,
      null,
      preferImmediatelyAvailable,
      origin,
      autoSelectAllowed,
    )
  } catch (_: SecurityException) {
    CreatePublicKeyCredentialRequest(
      optionsJson,
      null,
      preferImmediatelyAvailable,
      null,
      autoSelectAllowed,
    )
  }
}

private fun buildGetCredentialRequest(
  option: GetPublicKeyCredentialOption,
  origin: String?,
  preferImmediatelyAvailable: Boolean,
): GetCredentialRequest {
  val builder = GetCredentialRequest.Builder().addCredentialOption(option)
  if (preferImmediatelyAvailable) {
    builder.setPreferImmediatelyAvailableCredentials(true)
  }
  if (origin != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
    try {
      builder.setOrigin(origin)
    } catch (_: SecurityException) {
      // Apps without the SET_ORIGIN permission fall back to the default origin.
    }
  }
  return builder.build()
}

private fun canUseSetOrigin(activity: Activity): Boolean {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return false
  val permission = "android.permission.CREDENTIAL_MANAGER_SET_ORIGIN"
  return ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED
}
