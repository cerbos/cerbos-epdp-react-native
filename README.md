# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Cerbos Embedded (WebView)

This app includes a simple demo that runs `@cerbos/embedded-client` inside a `react-native-webview` and uses `postMessage` to invoke methods (currently `checkResource`) from the React Native UI.

- UI: `app/(tabs)/index.tsx`
- WebView bridge + RPC: `components/cerbos-embedded-webview.tsx`

### How it works

- The WebView loads a tiny HTML page (inline) that `import()`s `@cerbos/embedded-client` (via `esm.sh`) and fetches the Cerbos WASM binary (default: `unpkg.com/@cerbos/embedded-server/.../server.wasm`).
- The React Native side sends JSON-RPC-like messages to the WebView, and the WebView replies with the result (or a serialized error).

### Running the demo

1. Start the app (`npx expo start`) and open the Home tab.
2. Enter your Cerbos Hub `ruleId` (and optionally Hub client credentials).
3. Tap **Init Embedded Client**, then **Run checkResource**.

Note: the device/emulator running the app must be able to reach the Hub API and the WASM URL you configured.

### Production notes

- For offline/reproducible builds, avoid loading the SDK/WASM from public CDNs; bundle them with the app and update `components/cerbos-embedded-webview.tsx` to load from local assets.
- Don’t hardcode Hub credentials in the app; use a secure provisioning mechanism appropriate for your threat model.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
