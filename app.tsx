import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import 'react-native-gesture-handler'; // deve ser a 1ª importação
import Eventos from './app/screens/eventos';
import Usuarios from './app/screens/usuarios';
// opcional: ícones
import { Ionicons } from '@expo/vector-icons';

const Drawer = createDrawerNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Drawer.Navigator initialRouteName="Usuarios"
        screenOptions={{
          headerTitleAlign: 'center',
        }}
      >
        <Drawer.Screen
          name="Usuarios"
          component={Usuarios}
          options={{
            title: 'Cadastro de Usuários',
            drawerIcon: ({ size, color }) => <Ionicons name="home-outline" size={size} color={color} />,
          }}
        />
        <Drawer.Screen
          name="Eventos"
          component={Eventos}
          options={{
            title: 'Cadastro de Eventos',
            drawerIcon: ({ size, color }) => <Ionicons name="list-outline" size={size} color={color} />,
          }}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
