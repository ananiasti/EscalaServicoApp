import React from 'react';
import { ScrollView, Text } from 'react-native';
import BuildInfoCard from '../../components/BuildInfoCard';

export default function Sobre() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>Sobre o aplicativo</Text>

      <Text style={{ color: '#6b7280' }}>
        Veja abaixo detalhes da versão instalada, build nativo e informações de atualização OTA (EAS Updates).
      </Text>

      <BuildInfoCard />

      </ScrollView>
  );
}
