import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      {/* Conteúdo central */}
      <View style={styles.content}>
        <Text style={styles.title}>Escala de Serviço</Text>
      </View>

      {/* Texto fixo no rodapé */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Por Ananias Caetano - v1.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1, // ocupa o espaço disponível
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
  },
});
