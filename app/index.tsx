import { DrawerActions, useNavigation } from '@react-navigation/native';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Usuarios = { id: number; nome: string };

export default function Home() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      {/* Conteúdo central */}
      <View style={styles.content}>
        <Text style={styles.title}>Bem-vindo ao MESSE!</Text>
        <Text style={styles.title}>Escala de Serviço Paroquial</Text>

        <TouchableOpacity
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          activeOpacity={0.7}
        >
          <Image
            source={require('../assets/images/SaoJoseOperario.png')}
            style={styles.imginicio}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>

      {/* Rodapé */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
versão 1.0.0.0
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  imginicio: { width: 650, height: 650, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, alignItems: 'center', backgroundColor: '#fff' },
  footerText: { fontSize: 14, color: '#666' },
});
