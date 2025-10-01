import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Usuarios = { id: number; nome: string };

export default function Home() {
  return (
    <View style={styles.container}>
      {/* Conteúdo central */}


      {/* Rodapé */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Por Ananias Caetano - v1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'stretch' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, alignItems: 'center',
            backgroundColor: '#fff', }, footerText: { fontSize: 14, color: '#666' },
});
