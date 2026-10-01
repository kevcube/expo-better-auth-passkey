/* eslint-disable import/first */
import type { ClientStore } from "@better-auth/core";
import { Platform } from "react-native";

const createMockAtom = <T>(initialValue: T) => {
  let value = initialValue;
  return {
    get: () => value,
    set: (newValue: T) => {
      value = newValue;
    },
    subscribe: jest.fn(),
  };
};
// Mock react-native Platform
jest.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));

// Mock the native PasskeyModule
const mockRegisterPasskey = jest.fn();
const mockAuthenticatePasskey = jest.fn();
const mockCancelPasskeyAutoFill = jest.fn();

jest.mock("../BetterAuthReactNativePasskeyModule", () => ({
  __esModule: true,
  default: {
    registerPasskey: mockRegisterPasskey,
    authenticatePasskey: mockAuthenticatePasskey,
    cancelPasskeyAutoFill: mockCancelPasskeyAutoFill,
  },
}));

// Mock @better-auth/passkey/client
const mockGetPasskeyActions = jest.fn();
jest.mock("@better-auth/passkey/client", () => ({
  getPasskeyActions: mockGetPasskeyActions,
  passkeyClient: () => ({
    id: "passkey",
    $InferServerPlugin: {},
    getAtoms: () => ({ $listPasskeys: createMockAtom(0) }),
    pathMethods: {},
    atomListeners: [],
  }),
}));
import {
  cancelPasskeyAutoFill,
  expoPasskeyClient,
  getPasskeyActionsNative,
} from "../plugin";
describe("expoPasskeyClient", () => {
  const $store: ClientStore = {
    notify: jest.fn(),
    listen: jest.fn(),
    atoms: {},
  };
  const platform = Platform as { OS: string };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses native actions off the web", () => {
    const actions = expoPasskeyClient().getActions(jest.fn(), $store);

    expect(mockGetPasskeyActions).not.toHaveBeenCalled();
    expect(actions).toHaveProperty("signIn.passkey");
    expect(actions).toHaveProperty("passkey.addPasskey");
  });

  it("uses Better Auth's web actions on the web", () => {
    platform.OS = "web";
    try {
      expoPasskeyClient().getActions(jest.fn(), $store);
    } finally {
      platform.OS = "ios";
    }

    expect(mockGetPasskeyActions).toHaveBeenCalled();
  });
});

describe("getPasskeyActionsNative", () => {
  let mockFetch: jest.Mock;
  let $listPasskeys: {
    get: () => number;
    set: (newValue: number) => void;
    subscribe: jest.Mock;
  };
  let $store: ClientStore;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    $listPasskeys = createMockAtom(0);
    $store = { notify: jest.fn(), listen: jest.fn(), atoms: {} };
  });

  describe("signIn.passkey", () => {
    const mockAuthOptions = {
      challenge: "test-challenge",
      rpId: "example.com",
      allowCredentials: [],
    };

    const mockAssertion = {
      id: "credential-id",
      rawId: "raw-id",
      response: {
        authenticatorData: "auth-data",
        clientDataJSON: "client-data",
        signature: "signature",
      },
      type: "public-key",
    };

    const mockSession = {
      session: { id: "session-id", userId: "user-id" },
      user: { id: "user-id", email: "test@example.com" },
    };

    it("should successfully sign in with passkey", async () => {
      mockFetch
        .mockResolvedValueOnce({ data: mockAuthOptions, error: null })
        .mockResolvedValueOnce({ data: mockSession, error: null });

      mockAuthenticatePasskey.mockResolvedValueOnce(mockAssertion);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      const result = await actions.signIn.passkey();

      // Verify generate-authenticate-options was called
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "/passkey/generate-authenticate-options",
        { method: "GET", throw: false },
      );

      // Verify native module was called with correct options
      expect(mockAuthenticatePasskey).toHaveBeenCalledWith({
        optionsJSON: mockAuthOptions,
        useAutofill: undefined,
      });

      // Verify verify-authentication was called
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "/passkey/verify-authentication",
        expect.objectContaining({
          body: { response: mockAssertion },
          method: "POST",
          throw: false,
        }),
      );

      // Verify store was notified
      expect($store.notify).toHaveBeenCalledWith("$sessionSignal");

      // Verify successful result
      expect(result).toEqual({ data: mockSession, error: null });
    });

    it("should pass autoFill option to native module", async () => {
      mockFetch
        .mockResolvedValueOnce({ data: mockAuthOptions, error: null })
        .mockResolvedValueOnce({ data: mockSession, error: null });

      mockAuthenticatePasskey.mockResolvedValueOnce(mockAssertion);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      await actions.signIn.passkey({ autoFill: true });

      expect(mockAuthenticatePasskey).toHaveBeenCalledWith({
        optionsJSON: mockAuthOptions,
        useAutofill: true,
      });
    });

    describe("cancelPasskeyAutoFill while options are loading", () => {
      const signInAfterCancel = async (autoFill: boolean) => {
        const options = Promise.withResolvers<unknown>();
        mockFetch
          .mockReturnValueOnce(options.promise)
          .mockResolvedValueOnce({ data: mockSession, error: null });
        mockCancelPasskeyAutoFill.mockResolvedValueOnce(undefined);

        const actions = getPasskeyActionsNative(mockFetch, {
          $listPasskeys,
          $store,
        });
        const pending = actions.signIn.passkey({ autoFill });
        await cancelPasskeyAutoFill();
        options.resolve({ data: mockAuthOptions, error: null });
        return pending;
      };

      it("aborts an AutoFill sign-in before it reaches native", async () => {
        const result = await signInAfterCancel(true);

        expect(mockAuthenticatePasskey).not.toHaveBeenCalled();
        expect(result).toEqual({
          data: null,
          error: {
            code: "ERROR_CEREMONY_ABORTED",
            message: "Auth cancelled",
            status: 400,
            statusText: "BAD_REQUEST",
          },
        });
      });

      it("leaves a modal sign-in running", async () => {
        mockAuthenticatePasskey.mockResolvedValueOnce(mockAssertion);
        const result = await signInAfterCancel(false);

        expect(mockAuthenticatePasskey).toHaveBeenCalled();
        expect(result).toEqual({ data: mockSession, error: null });
      });
    });

    it("should return early if generate-authenticate-options fails", async () => {
      const errorResponse = {
        data: null,
        error: { message: "Server error", status: 500 },
      };
      mockFetch.mockResolvedValueOnce(errorResponse);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      const result = await actions.signIn.passkey();

      expect(mockAuthenticatePasskey).not.toHaveBeenCalled();
      expect(result).toEqual(errorResponse);
    });

    it("should handle native module authentication error", async () => {
      mockFetch.mockResolvedValueOnce({ data: mockAuthOptions, error: null });
      mockAuthenticatePasskey.mockRejectedValueOnce(
        new Error("User cancelled"),
      );

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      const result = await actions.signIn.passkey();

      expect(result).toEqual({
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: "Auth cancelled",
          status: 400,
          statusText: "BAD_REQUEST",
        },
      });
      expect($store.notify).not.toHaveBeenCalled();
    });

    it("should handle non-Error exceptions", async () => {
      mockFetch.mockResolvedValueOnce({ data: mockAuthOptions, error: null });
      mockAuthenticatePasskey.mockRejectedValueOnce("string error");

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      const result = await actions.signIn.passkey();

      expect(result).toEqual({
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: "Auth cancelled",
          status: 400,
          statusText: "BAD_REQUEST",
        },
      });
    });

    it("should not notify store if verification fails", async () => {
      mockFetch
        .mockResolvedValueOnce({ data: mockAuthOptions, error: null })
        .mockResolvedValueOnce({
          data: null,
          error: { message: "Verification failed" },
        });

      mockAuthenticatePasskey.mockResolvedValueOnce(mockAssertion);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      await actions.signIn.passkey();

      expect($store.notify).not.toHaveBeenCalled();
    });
  });

  describe("passkey.addPasskey", () => {
    const mockRegisterOptions = {
      challenge: "test-challenge",
      rp: { name: "Example", id: "example.com" },
      user: { id: "user-id", name: "test", displayName: "Test User" },
      pubKeyCredParams: [],
    };

    const mockAttestation = {
      id: "credential-id",
      rawId: "raw-id",
      response: {
        attestationObject: "attestation",
        clientDataJSON: "client-data",
      },
      type: "public-key",
    };

    const mockPasskey = {
      id: "passkey-id",
      name: "My Passkey",
      credentialID: "credential-id",
    };

    it("should successfully register a passkey", async () => {
      mockFetch
        .mockResolvedValueOnce({ data: mockRegisterOptions, error: null })
        .mockResolvedValueOnce({ data: { passkey: mockPasskey }, error: null });

      mockRegisterPasskey.mockResolvedValueOnce(mockAttestation);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      const result = await actions.passkey.addPasskey();

      // Verify generate-register-options was called
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "/passkey/generate-register-options",
        { method: "GET", query: {}, throw: false },
      );

      // Verify native module was called
      expect(mockRegisterPasskey).toHaveBeenCalledWith({
        optionsJSON: mockRegisterOptions,
        useAutoRegister: undefined,
      });

      // Verify verify-registration was called
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "/passkey/verify-registration",
        expect.objectContaining({
          body: { response: mockAttestation, name: undefined },
          method: "POST",
          throw: false,
        }),
      );

      expect(result).toEqual({ data: { passkey: mockPasskey }, error: null });
    });

    it("should pass name and authenticatorAttachment options", async () => {
      mockFetch
        .mockResolvedValueOnce({ data: mockRegisterOptions, error: null })
        .mockResolvedValueOnce({ data: { passkey: mockPasskey }, error: null });

      mockRegisterPasskey.mockResolvedValueOnce(mockAttestation);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      await actions.passkey.addPasskey({
        name: "Work Laptop",
        authenticatorAttachment: "platform",
      });

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "/passkey/generate-register-options",
        {
          method: "GET",
          query: {
            authenticatorAttachment: "platform",
            name: "Work Laptop",
          },
          throw: false,
        },
      );

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "/passkey/verify-registration",
        expect.objectContaining({
          body: { response: mockAttestation, name: "Work Laptop" },
        }),
      );
    });

    it("should pass useAutoRegister to native module", async () => {
      mockFetch
        .mockResolvedValueOnce({ data: mockRegisterOptions, error: null })
        .mockResolvedValueOnce({ data: { passkey: mockPasskey }, error: null });

      mockRegisterPasskey.mockResolvedValueOnce(mockAttestation);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      await actions.passkey.addPasskey({ useAutoRegister: true });

      expect(mockRegisterPasskey).toHaveBeenCalledWith({
        optionsJSON: mockRegisterOptions,
        useAutoRegister: true,
      });
    });

    it("should return early if generate-register-options fails", async () => {
      const errorResponse = {
        data: null,
        error: { message: "Unauthorized", status: 401 },
      };
      mockFetch.mockResolvedValueOnce(errorResponse);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      const result = await actions.passkey.addPasskey();

      expect(mockRegisterPasskey).not.toHaveBeenCalled();
      expect(result).toEqual(errorResponse);
    });

    it("should handle native module registration error", async () => {
      mockFetch.mockResolvedValueOnce({
        data: mockRegisterOptions,
        error: null,
      });
      mockRegisterPasskey.mockRejectedValueOnce(
        new Error("Biometric not available"),
      );

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      const result = await actions.passkey.addPasskey();

      expect(result).toEqual({
        data: null,
        error: {
          code: "UNKNOWN_ERROR",
          message: "Biometric not available",
          status: 500,
          statusText: "INTERNAL_SERVER_ERROR",
        },
      });
    });

    it("should return verification error without updating listPasskeys", async () => {
      const initialValue = $listPasskeys.get();

      mockFetch
        .mockResolvedValueOnce({ data: mockRegisterOptions, error: null })
        .mockResolvedValueOnce({
          data: null,
          error: { message: "Invalid attestation" },
        });

      mockRegisterPasskey.mockResolvedValueOnce(mockAttestation);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      const result = await actions.passkey.addPasskey();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      // $listPasskeys should not have been updated
      expect($listPasskeys.get()).toBe(initialValue);
    });

    it("should update $listPasskeys on successful registration", async () => {
      const initialValue = $listPasskeys.get();

      mockFetch
        .mockResolvedValueOnce({ data: mockRegisterOptions, error: null })
        .mockResolvedValueOnce({ data: { passkey: mockPasskey }, error: null });

      mockRegisterPasskey.mockResolvedValueOnce(mockAttestation);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      await actions.passkey.addPasskey();

      // $listPasskeys should have been updated (set to a random number)
      expect($listPasskeys.get()).not.toBe(initialValue);
    });
  });

  describe("upstream error parity", () => {
    beforeEach(() => {
      jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const failCeremony = async (error: unknown) => {
      mockFetch.mockResolvedValue({ data: {}, error: null });
      mockAuthenticatePasskey.mockRejectedValueOnce(error);
      mockRegisterPasskey.mockRejectedValueOnce(error);
      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });
      return {
        signIn: await actions.signIn.passkey(),
        registration: await actions.passkey.addPasskey(),
      };
    };

    it.each([
      ["platform failure", "GET_ERROR"],
      ["unknown ERROR_ code", "ERROR_NOT_WEBAUTHN"],
      ["inherited property name", "toString"],
      ["obsolete cancellation code", "CANCELLED"],
    ])("uses action-specific fallbacks for %s", async (_name, code) => {
      const result = await failCeremony(
        Object.assign(new Error("Native failure"), { code }),
      );

      expect(result).toEqual({
        signIn: {
          data: null,
          error: {
            code: "AUTH_CANCELLED",
            message: "Auth cancelled",
            status: 400,
            statusText: "BAD_REQUEST",
          },
        },
        registration: {
          data: null,
          error: {
            code: "UNKNOWN_ERROR",
            message: "Native failure",
            status: 500,
            statusText: "INTERNAL_SERVER_ERROR",
          },
        },
      });
      expect($store.notify).not.toHaveBeenCalled();
    });

    it.each([
      ["a non-Error object", { code: "GET_ERROR", message: "Native failure" }],
      ["null", null],
    ])(
      "uses the upstream unknown registration message for %s",
      async (_name, error) => {
        const { registration } = await failCeremony(error);

        expect(registration).toEqual({
          data: null,
          error: {
            code: "UNKNOWN_ERROR",
            message: "Unknown error",
            status: 500,
            statusText: "INTERNAL_SERVER_ERROR",
          },
        });
      },
    );

    it("preserves an empty Error message in the registration fallback", async () => {
      const { registration } = await failCeremony(new Error(""));

      expect(registration).toEqual({
        data: null,
        error: {
          code: "UNKNOWN_ERROR",
          message: "",
          status: 500,
          statusText: "INTERNAL_SERVER_ERROR",
        },
      });
    });

    it.each([
      ["ERROR_CEREMONY_ABORTED", "Registration cancelled"],
      ["ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", "Previously registered"],
      ["ERROR_INVALID_RP_ID", "Native failure"],
    ])(
      "preserves %s with upstream action-specific messages",
      async (code, message) => {
        const result = await failCeremony(
          Object.assign(new Error("Native failure"), { code }),
        );

        expect(result).toEqual({
          signIn: {
            data: null,
            error: {
              code,
              message: "Auth cancelled",
              status: 400,
              statusText: "BAD_REQUEST",
            },
          },
          registration: {
            data: null,
            error: {
              code,
              message,
              status: 400,
              statusText: "BAD_REQUEST",
            },
          },
        });
      },
    );

    it("recognizes serialized WebAuthn errors even with an empty message", async () => {
      const result = await failCeremony({
        code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
        message: "",
      });

      expect(result.signIn.error).toEqual({
        code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
        message: "Auth cancelled",
        status: 400,
        statusText: "BAD_REQUEST",
      });
      expect(result.registration.error).toEqual({
        code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
        message: "",
        status: 400,
        statusText: "BAD_REQUEST",
      });
    });

    it("does not preserve ceremony codes thrown during sign-in verification", async () => {
      mockFetch
        .mockResolvedValueOnce({ data: {}, error: null })
        .mockRejectedValueOnce(
          Object.assign(new Error("Verification failed"), {
            code: "ERROR_CEREMONY_ABORTED",
          }),
        );
      mockAuthenticatePasskey.mockResolvedValueOnce({
        clientExtensionResults: {},
      });
      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      expect(await actions.signIn.passkey()).toEqual({
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: "Auth cancelled",
          status: 400,
          statusText: "BAD_REQUEST",
        },
      });
      expect($store.notify).not.toHaveBeenCalled();
    });

    it("returns server verification errors without normalizing them", async () => {
      const serverResponse = {
        data: null,
        error: {
          code: "PASSKEY_NOT_FOUND",
          message: "Passkey not found",
          status: 404,
          statusText: "NOT_FOUND",
        },
      };
      mockFetch
        .mockResolvedValueOnce({ data: {}, error: null })
        .mockResolvedValueOnce(serverResponse)
        .mockResolvedValueOnce({ data: {}, error: null })
        .mockResolvedValueOnce(serverResponse);
      mockAuthenticatePasskey.mockResolvedValueOnce({
        clientExtensionResults: {},
      });
      mockRegisterPasskey.mockResolvedValueOnce({
        clientExtensionResults: {},
      });
      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store,
      });

      expect(await actions.signIn.passkey()).toEqual(serverResponse);
      expect(await actions.passkey.addPasskey()).toEqual(serverResponse);
    });
  });
});
