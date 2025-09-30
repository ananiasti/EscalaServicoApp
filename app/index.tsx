import { Link } from 'expo-router';
import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bem-vindo 👋</Text>

      <Link href={{ pathname: '/tela1' }} asChild>
        <Button title="Ir para Tela 1" onPress={() => {}} />
      </Link>

      <Link href={{ pathname: '/tela2' }} asChild>
        <Button title="Ir para Tela 2" onPress={() => {}} />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
});
