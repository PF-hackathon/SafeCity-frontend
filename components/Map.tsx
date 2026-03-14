import { StyleSheet, View, Text } from 'react-native';

export default function Map() {
  return (
    <View style={styles.center}>
      <Text>Map cannot be displayed on the web. Please use a physical device or emulator.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
});
