// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true

// Configure server to serve .well-known directory
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (req.url === '/.well-known/apple-app-site-association') {
        const fs = require('fs');
        const aasaPath = path.join(__dirname, '.well-known', 'apple-app-site-association');
        if (fs.existsSync(aasaPath)) {
          const content = fs.readFileSync(aasaPath, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(content);
          return;
        }
      }
      return middleware(req, res, next);
    };
  },
};

// npm v7+ will install ../node_modules/react and ../node_modules/react-native because of peerDependencies.
// To prevent the incompatible react-native between ./node_modules/react-native and ../node_modules/react-native,
// excludes the one from the parent folder when bundling.
config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(path.resolve("..", "node_modules", "react")),
  new RegExp(path.resolve("..", "node_modules", "react-native")),
  // Avoid pulling in a second copy of Expo or its metro runtime from the parent workspace
  new RegExp(path.resolve("..", "node_modules", "expo")),
  new RegExp(path.resolve("..", "node_modules", "@expo", "metro-runtime")),
];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "./node_modules"),
  path.resolve(__dirname, "../node_modules"),
];

config.resolver.extraNodeModules = {
  "better-auth-react-native-passkey": "..",
};

config.watchFolders = [path.resolve(__dirname, "..")];

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

// Add asset extensions for serving static files
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  // Remove json from asset extensions so it can be imported as JS
].filter(ext => ext !== 'json');

config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'json'
];

module.exports = config;
