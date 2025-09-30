import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function Tela2() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Bem-vindo à Tela 2 🚀</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 18 },
});
