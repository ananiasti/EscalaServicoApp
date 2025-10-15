import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

export default function BuildInfoCard() {
  const [checking, setChecking] = useState(false);
  const [lastMsg, setLastMsg] = useState<string | null>(null);

  // Versões do app
  const appVersion = Constants.expoConfig?.version ?? '—';            // ex.: 1.0.5 (do app.json)
  const nativeVersion = Application.nativeApplicationVersion ?? '—';  // ex.: 1.0.5 (nativo)
  const nativeBuild = Application.nativeBuildVersion ?? '—';          // iOS: buildNumber | Android: versionCode

  // EAS Updates
  const updateId = Updates.updateId ?? '—';
  const runtimeVersion = Updates.runtimeVersion ?? '—';
  const isEmbedded = Updates.isEmbeddedLaunch ?? false;
  const isEmergency = Updates.isEmergencyLaunch ?? false;

  async function checkNow() {
    try {
      setChecking(true);
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        await Updates.fetchUpdateAsync();
        setLastMsg('Atualização baixada. Reiniciando…');
        await Updates.reloadAsync();
      } else {
        setLastMsg('Nenhuma atualização disponível.');
      }
    } catch {
      setLastMsg('Falha ao verificar atualização.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <View style={{
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#fff',
      gap: 6
    }}>
      <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
        Informações da versão
      </Text>
      <Text></Text>     
      <Text>Versão do MESSE: 1.0.0.1 </Text>     
      <Text>Sistema: {Platform.OS === 'ios' ? 'iOS' : 'Android'}</Text>
      <Text>Versão (app.json): {appVersion}</Text>
      <Text>Versão nativa: {nativeVersion}</Text>
      <Text>Build nativo: {nativeBuild}</Text>

      <Text>Runtime (OTA): {runtimeVersion}</Text>
      <Text>Update ID: {updateId}</Text>
      <Text>Origem: {isEmbedded ? 'Embarcada' : 'OTA'} {isEmergency ? '(Emergência)' : ''}</Text>
      <Text>Autor: Ananias Caetano </Text>
      <Pressable
        onPress={checkNow}
        disabled={checking}
        style={{
          marginTop: 8,
          alignSelf: 'flex-start',
          backgroundColor: '#2563eb',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8
        }}
      >
        {checking
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={{ color: '#fff', fontWeight: '700' }}>Verificar atualização</Text>}
      </Pressable>

      {!!lastMsg && (
        <Text style={{ fontSize: 12, color: '#6b7280' }}>{lastMsg}</Text>
      )}
    </View>
  );
}
