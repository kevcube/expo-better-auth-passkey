// Mock nanostores
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

jest.mock("nanostores", () => ({
  atom: <T>(initial: T) => createMockAtom(initial),
}));

// Mock react-native Platform
jest.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));

// Mock the native PasskeyModule
const mockRegisterPasskey = jest.fn();
const mockAuthenticatePasskey = jest.fn();

jest.mock("../BetterAuthReactNativePasskeyModule", () => ({
  __esModule: true,
  default: {
    registerPasskey: mockRegisterPasskey,
    authenticatePasskey: mockAuthenticatePasskey,
  },
}));

// Mock @better-auth/passkey/client
const mockGetPasskeyActions = jest.fn();
jest.mock("@better-auth/passkey/client", () => ({
  getPasskeyActions: mockGetPasskeyActions,
  passkeyClient: () => ({
    id: "passkey",
    $InferServerPlugin: {},
    getAtoms: jest.fn(),
    pathMethods: {},
    atomListeners: [],
  }),
}));

import { Platform } from "react-native";
import { expoPasskeyClient, getPasskeyActionsNative } from "../plugin";
import { atom } from "nanostores";

describe("expoPasskeyClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return a valid BetterAuthClientPlugin structure", () => {
    const client = expoPasskeyClient();

    expect(client).toHaveProperty("id", "passkey");
    expect(client).toHaveProperty("$InferServerPlugin");
    expect(client).toHaveProperty("getActions");
    expect(client).toHaveProperty("getAtoms");
    expect(client).toHaveProperty("pathMethods");
    expect(client).toHaveProperty("atomListeners");
    expect(typeof client.getActions).toBe("function");
  });

  it("should use native actions when Platform.OS is not web", () => {
    const client = expoPasskeyClient();
    const mockFetch = jest.fn();
    const mockStore = { notify: jest.fn() } as any;

    // Platform.OS is mocked as 'ios'
    const actions = client.getActions(mockFetch, mockStore, undefined);

    // Should NOT call the web getPasskeyActions
    expect(mockGetPasskeyActions).not.toHaveBeenCalled();
    // Should return native actions structure
    expect(actions).toHaveProperty("signIn.passkey");
    expect(actions).toHaveProperty("passkey.addPasskey");
  });

  it("should use web actions when Platform.OS is web", () => {
    // Temporarily change Platform.OS to web
    (Platform as any).OS = "web";

    const client = expoPasskeyClient();
    const mockFetch = jest.fn();
    const mockStore = { notify: jest.fn() } as any;

    mockGetPasskeyActions.mockReturnValue({
      signIn: { passkey: jest.fn() },
      passkey: { addPasskey: jest.fn() },
    });

    client.getActions(mockFetch, mockStore, undefined);

    expect(mockGetPasskeyActions).toHaveBeenCalled();

    // Reset Platform.OS
    (Platform as any).OS = "ios";
  });
});

describe("getPasskeyActionsNative", () => {
  let mockFetch: jest.Mock;
  let $listPasskeys: ReturnType<typeof atom<number>>;
  let $store: { notify: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    $listPasskeys = atom<number>(0);
    $store = { notify: jest.fn() };
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
        $store: $store as any,
      });

      const result = await actions.signIn.passkey();

      // Verify generate-authenticate-options was called
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "/passkey/generate-authenticate-options",
        { method: "GET" }
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
        })
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
        $store: $store as any,
      });

      await actions.signIn.passkey({ autoFill: true });

      expect(mockAuthenticatePasskey).toHaveBeenCalledWith({
        optionsJSON: mockAuthOptions,
        useAutofill: true,
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
        $store: $store as any,
      });

      const result = await actions.signIn.passkey();

      expect(mockAuthenticatePasskey).not.toHaveBeenCalled();
      expect(result).toEqual(errorResponse);
    });

    it("should handle native module authentication error", async () => {
      mockFetch.mockResolvedValueOnce({ data: mockAuthOptions, error: null });
      mockAuthenticatePasskey.mockRejectedValueOnce(
        new Error("User cancelled")
      );

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store: $store as any,
      });

      const result = await actions.signIn.passkey();

      expect(result).toEqual({
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: "User cancelled",
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
        $store: $store as any,
      });

      const result = await actions.signIn.passkey();

      expect(result).toEqual({
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: "auth cancelled",
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
        $store: $store as any,
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
        $store: $store as any,
      });

      const result = await actions.passkey.addPasskey();

      // Verify generate-register-options was called
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "/passkey/generate-register-options",
        { method: "GET", query: {} }
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
        })
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
        $store: $store as any,
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
        }
      );

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "/passkey/verify-registration",
        expect.objectContaining({
          body: { response: mockAttestation, name: "Work Laptop" },
        })
      );
    });

    it("should pass useAutoRegister to native module", async () => {
      mockFetch
        .mockResolvedValueOnce({ data: mockRegisterOptions, error: null })
        .mockResolvedValueOnce({ data: { passkey: mockPasskey }, error: null });

      mockRegisterPasskey.mockResolvedValueOnce(mockAttestation);

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store: $store as any,
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
        $store: $store as any,
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
        new Error("Biometric not available")
      );

      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store: $store as any,
      });

      const result = await actions.passkey.addPasskey();

      expect(result).toEqual({
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: "Biometric not available",
          status: 400,
          statusText: "BAD_REQUEST",
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
        $store: $store as any,
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
        $store: $store as any,
      });

      await actions.passkey.addPasskey();

      // $listPasskeys should have been updated (set to a random number)
      expect($listPasskeys.get()).not.toBe(initialValue);
    });
  });

  describe("returned actions structure", () => {
    it("should return correct action structure", () => {
      const actions = getPasskeyActionsNative(mockFetch, {
        $listPasskeys,
        $store: $store as any,
      });

      expect(actions).toEqual({
        signIn: {
          passkey: expect.any(Function),
        },
        passkey: {
          addPasskey: expect.any(Function),
        },
        $Infer: {},
      });
    });
  });
});
