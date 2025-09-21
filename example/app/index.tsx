import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Button,
} from "react-native";
import { authClient } from "@/lib/auth-client";

export default function App() {
  const [passkeyName, setPasskeyName] = useState("");
  const { data: session, isPending } = authClient.useSession();

  // Check if passkey functionality is available
  const isPasskeyAvailable = !!(authClient.signIn.passkey && authClient.passkey.addPasskey);

  const handleCreatePasskey = async () => {
    if (!passkeyName.trim()) {
      Alert.alert("Error", "Please enter a passkey name");
      return;
    }

    try {
      if (!session) {
        await authClient.signIn.anonymous();
      }

      // Check if passkey registration is available
      if (!authClient.passkey.addPasskey) {
        Alert.alert("Error", "Passkey registration is not available on this platform");
        return;
      }

      const result = await authClient.passkey.addPasskey({
        name: passkeyName.trim(),
      });
      console.log("result", result);
      if (result?.error) {
        Alert.alert(
          "Error",
          result?.error?.message || "Failed to create passkey",
        );
        console.error(result, result?.error);
      } else {
        console.log("Passkey created", result);
        Alert.alert("Success", "Passkey created successfully!");
        setPasskeyName("");
      }
    } catch (error) {
      Alert.alert("Error", "An unexpected error occurred");
      console.error(error);
    }
  };

  const handleLoginWithPasskey = async () => {
    try {
      // Check if passkey sign-in is available
      if (!authClient.signIn.passkey) {
        Alert.alert("Error", "Passkey authentication is not available on this platform");
        return;
      }

      // For demo purposes, using a placeholder email
      // In a real app, you'd get this from user input or stored session
      const result = await authClient.signIn.passkey({
        email: "user@example.com",
      });

      if (result.data) {
        Alert.alert("Success", "Logged in successfully!");
      } else {
        console.error(result);
        Alert.alert("Error", result.error?.message || "Failed to login");
      }
    } catch (error) {
      Alert.alert("Error", "An unexpected error occurred");
      console.error(error);
    }
  };

  const handleSignOut = async () => {
    const result = await authClient.signOut();
    console.log("signout", result);
  };

  return (
    <View style={styles.container}>
        <Text style={styles.title}>Better Auth Passkey Demo</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {isPending
              ? "Loading session..."
              : session
                ? `Signed in as ${
                    session.user?.email ??
                    session.user?.name ??
                    session.user?.id
                  }`
                : "Signed out"}
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Passkey Name:</Text>
          <TextInput
            style={styles.input}
            value={passkeyName}
            onChangeText={setPasskeyName}
            placeholder="Enter passkey name"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, !isPasskeyAvailable && styles.disabledButton]}
            onPress={handleCreatePasskey}
            disabled={!isPasskeyAvailable}
          >
            <Text style={styles.buttonText}>Create Passkey</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.loginButton, !isPasskeyAvailable && styles.disabledButton]}
            onPress={handleLoginWithPasskey}
            disabled={!isPasskeyAvailable}
          >
            <Text style={styles.buttonText}>Login with Passkey</Text>
          </TouchableOpacity>

          {!isPasskeyAvailable && (
            <Text style={styles.warningText}>
              Passkey functionality is not available on this platform
            </Text>
          )}
        </View>
        <Button title="Sign Out" onPress={handleSignOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 30,
    color: "#333",
  },
  inputContainer: {
    width: "100%",
    maxWidth: 300,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 300,
    gap: 12,
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  loginButton: {
    backgroundColor: "#34C759",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  infoBox: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#eaf2ff",
    marginBottom: 16,
  },
  infoText: {
    color: "#2b5fb8",
  },
  disabledButton: {
    backgroundColor: "#ccc",
    opacity: 0.6,
  },
  warningText: {
    color: "#ff6b6b",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
});
