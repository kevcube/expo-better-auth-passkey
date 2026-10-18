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
import androidx.credentials.exceptions.domerrors.AbortError
import androidx.credentials.exceptions.domerrors.ConstraintError
import androidx.credentials.exceptions.domerrors.DomError
import androidx.credentials.exceptions.domerrors.InvalidStateError
import androidx.credentials.exceptions.domerrors.NotAllowedError
import androidx.credentials.exceptions.domerrors.NotSupportedError
import androidx.credentials.exceptions.domerrors.SecurityError
import androidx.credentials.exceptions.domerrors.UnknownError
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException
import androidx.credentials.exceptions.publickeycredential.GetPublicKeyCredentialDomException
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
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

  override fun definition() = ModuleDefinition {
    Name("BetterAuthReactNativePasskey")

    OnDestroy {
      scope.cancel()
    }

    AsyncFunction("registerPasskey") { payload: Map<String, Any?>, promise: Promise ->
      val activity: Activity = appContext.currentActivity ?: run {
        promise.reject("NO_ACTIVITY", "No current Activity available", null)
        return@AsyncFunction
      }

      val optionsJsonObject = (payload["optionsJSON"] as? Map<*, *>)?.let(::JSONObject) ?: run {
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

      scope.launch {
        try {
          val request = CreatePublicKeyCredentialRequest(
            optionsJsonObject.toString(),
            null,
            useAutoRegister,
            origin.takeIf { canUseSetOrigin(activity) },
            useAutoRegister,
          )
          when (val result = CredentialManager.create(activity).createCredential(activity, request)) {
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
          val code = registrationErrorCode(e.domError, optionsJsonObject, useAutoRegister)
          if (code != null) {
            promise.reject(code, message, e)
          } else {
            promise.reject("CREATE_ERROR", "$message [${e.type}]", e)
          }
        } catch (e: CreateCredentialException) {
          promise.reject("CREATE_ERROR", "${e.message ?: "Failed to create passkey"} [${e.type}]", e)
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

      val optionsJsonObject = (payload["optionsJSON"] as? Map<*, *>)?.let(::JSONObject) ?: run {
        promise.reject("INVALID_OPTIONS", "optionsJSON must be an object", null)
        return@AsyncFunction
      }

      val rpId = optionsJsonObject.optString("rpId")
      if (rpId.isBlank()) {
        promise.reject("INVALID_OPTIONS", "rpId is required", null)
        return@AsyncFunction
      }

      val useAutofill = payload["useAutofill"] as? Boolean ?: false
      val origin = "https://$rpId"

      scope.launch {
        try {
          val request = GetCredentialRequest.Builder()
            .addCredentialOption(GetPublicKeyCredentialOption(optionsJsonObject.toString()))
            .setPreferImmediatelyAvailableCredentials(useAutofill)
            .apply { if (canUseSetOrigin(activity)) setOrigin(origin) }
            .build()
          val result = CredentialManager.create(activity).getCredential(activity, request)

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
        } catch (e: GetPublicKeyCredentialDomException) {
          val message = e.message ?: "Failed to get passkey"
          val code = authenticationErrorCode(e.domError)
          if (code != null) {
            promise.reject(code, message, e)
          } else {
            promise.reject("GET_ERROR", "$message [${e.type}]", e)
          }
        } catch (e: GetCredentialException) {
          promise.reject("GET_ERROR", "${e.message ?: "Failed to get passkey"} [${e.type}]", e)
        } catch (e: Exception) {
          promise.reject("UNKNOWN_ERROR", e.message ?: "Unknown error", e)
        }
      }
    }

    // Credential Manager has no AutoFill-assisted requests (`useAutofill` only
    // prefers immediately available credentials in the modal sheet), so there
    // is never a pending one to cancel.
    AsyncFunction("cancelPasskeyAutoFill") {}
  }
}

// Setting an origin requires the privileged CREDENTIAL_MANAGER_SET_ORIGIN
// permission (API 34+); without it Credential Manager uses the app's own.
private fun canUseSetOrigin(activity: Activity): Boolean =
  Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
    ContextCompat.checkSelfPermission(activity, "android.permission.CREDENTIAL_MANAGER_SET_ORIGIN") ==
    PackageManager.PERMISSION_GRANTED

// Mirror @simplewebauthn/browser's identifyRegistrationError and
// identifyAuthenticationError, so a DOM error gets the code the web client
// reports. Native requests have no page origin, so a SecurityError always
// means the app is not associated with the RP ID. Unmapped errors return null.
private fun registrationErrorCode(
  error: DomError,
  options: JSONObject,
  useAutoRegister: Boolean,
): String? {
  val selection = options.optJSONObject("authenticatorSelection")
  val uvRequired = selection?.optString("userVerification") == "required"
  return when (error) {
    is AbortError -> "ERROR_CEREMONY_ABORTED"
    is ConstraintError -> when {
      selection?.optBoolean("requireResidentKey") == true ->
        "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT"
      useAutoRegister && uvRequired -> "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE"
      uvRequired -> "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT"
      else -> null
    }
    is InvalidStateError -> "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"
    is NotAllowedError -> "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY"
    is NotSupportedError -> {
      val params = options.optJSONArray("pubKeyCredParams")
      val hasPublicKeyParam = params != null &&
        (0 until params.length()).any { params.optJSONObject(it)?.optString("type") == "public-key" }
      if (hasPublicKeyParam) {
        "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG"
      } else {
        "ERROR_MALFORMED_PUBKEYCREDPARAMS"
      }
    }
    is SecurityError -> "ERROR_INVALID_RP_ID"
    is UnknownError -> "ERROR_AUTHENTICATOR_GENERAL_ERROR"
    else -> null
  }
}

private fun authenticationErrorCode(error: DomError): String? = when (error) {
  is AbortError -> "ERROR_CEREMONY_ABORTED"
  is NotAllowedError -> "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY"
  is SecurityError -> "ERROR_INVALID_RP_ID"
  is UnknownError -> "ERROR_AUTHENTICATOR_GENERAL_ERROR"
  else -> null
}

private fun Any?.fromJsonValue(): Any? = when (this) {
  is JSONObject -> toMap()
  is JSONArray -> List(length()) { get(it).fromJsonValue() }
  JSONObject.NULL -> null
  else -> this
}

private fun JSONObject.toMap(): Map<String, Any?> =
  keys().asSequence().associateWith { get(it).fromJsonValue() }
