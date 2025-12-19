const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts = Array.from(new Set([...config.resolver.assetExts, 'wasm', 'html', 'bundle']));

module.exports = config;
