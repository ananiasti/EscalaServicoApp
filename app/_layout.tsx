import { Ionicons } from '@expo/vector-icons';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import 'react-native-gesture-handler'; // ajuda o Drawer no Android

export default function RootLayout() {
  return (
    <Drawer
      initialRouteName="tela1"
      screenOptions={{ headerTitleAlign: 'center' }}
    >
      {/* "index" é a rota / (opcional) */}
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
        name="tela1"
        options={{
          title: 'Tela 1',
          drawerIcon: ({ size, color }) => (
            <Ionicons name="albums-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="tela2"
        options={{
          title: 'Tela 2',
          drawerIcon: ({ size, color }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
    </Drawer>
  );
}
