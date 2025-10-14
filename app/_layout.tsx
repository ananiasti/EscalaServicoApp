// app/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        screenOptions={{
          headerTitleAlign: 'center',
        }}
      >  
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
          name="screens/usuarios" // caminho relativo ao app/
          options={{
            title: 'Cadastro de Usuários',
            drawerIcon: ({ size, color }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="screens/ausencias"
          options={{
            title: 'Cadastro de Ausências',
            drawerIcon: ({ size, color }) => (
              <Ionicons name="radio-button-on" size={size} color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="screens/enfermos"
          options={{
            title: 'Cadastro de Enfermos',
            drawerIcon: ({ size, color }) => (
              <Ionicons name="medkit-outline" size={size} color={color} />
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
        <Drawer.Screen
          name="screens/escalas"
          options={{
            title: 'Escalas',
            drawerIcon: ({ size, color }) => (
              <Ionicons name="list-outline" size={size} color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="screens/sobre"
          options={{
            title: 'Sobre',
            drawerIcon: ({ size, color }) => (
              <Ionicons name="information-circle-outline" size={size} color={color} />
            ),
          }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}
