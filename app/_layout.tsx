import { Ionicons } from '@expo/vector-icons';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import 'react-native-gesture-handler'; // primeira import ajuda o Drawer no Android

export default function RootLayout() {
  return (
    <Drawer
      initialRouteName="screens/usuarios"
      screenOptions={{ headerTitleAlign: 'center' }}
    >
      {/* "index" corresponde a app/index.tsx (rota "/") */}
      <Drawer.Screen
        name="index"
        options={{
          title: 'Início',
          drawerIcon: ({ size, color }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="screens/usuarios"
        options={{
          title: 'Cadastro de Usuários',
          drawerIcon: ({ size, color }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="screens/eventos"
        options={{
          title: 'Cadastro de Eventos',
          drawerIcon: ({ size, color }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
    </Drawer>
  );
}
