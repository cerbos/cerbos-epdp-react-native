import { StyleSheet } from 'react-native';

import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';




export default function HomeScreen() {
  return (





    <WebView
      style={styles.webview}
      source={{ uri: 'https://expo.dev' }}
    />

  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  webview: {
    flex: 1,
    marginTop: Constants.statusBarHeight,
  }
});
