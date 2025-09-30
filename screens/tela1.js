import { StyleSheet, Text, View } from 'react-native';

export default function Tela1() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Esta é a Tela 1 👋</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 18 },
});