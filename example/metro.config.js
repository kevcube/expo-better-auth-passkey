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

const tlsCert = path.join(
  __dirname,
  "certs",
  "macbook-pro.bat-monster.ts.net.crt",
);
const tlsKey = path.join(
  __dirname,
  "certs",
  "macbook-pro.bat-monster.ts.net.key",
);

config.server = {
  ...config.server,
  ...(fs.existsSync(tlsCert) && fs.existsSync(tlsKey)
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
