const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "tslib") {
    return {
      filePath: require.resolve("tslib/tslib.js"),
      type: "sourceFile",
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// `tailscale cert <host>` output, if present, so Metro serves HTTPS directly.
const rpId = process.env.EXPO_PUBLIC_PASSKEY_RP_ID;
const tlsCert = rpId && path.join(__dirname, "certs", `${rpId}.crt`);
const tlsKey = rpId && path.join(__dirname, "certs", `${rpId}.key`);

config.server = {
  ...config.server,
  ...(tlsCert && fs.existsSync(tlsCert) && fs.existsSync(tlsKey)
    ? {
        tls: {
          cert: fs.readFileSync(tlsCert),
          key: fs.readFileSync(tlsKey),
        },
      }
    : {}),
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (
        req.url === "/.well-known/apple-app-site-association" ||
        req.url === "/.well-known/assetlinks.json"
      ) {
        const fileName = req.url.endsWith("assetlinks.json")
          ? "assetlinks.json"
          : "apple-app-site-association";
        const wellKnownPath = path.join(__dirname, ".well-known", fileName);
        const publicPath = path.join(
          __dirname,
          "public",
          ".well-known",
          fileName,
        );
        const filePath = fs.existsSync(wellKnownPath)
          ? wellKnownPath
          : publicPath;
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf8");
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache");
          res.end(content);
          return;
        }
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
