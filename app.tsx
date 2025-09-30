import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import 'react-native-gesture-handler'; // deve ser a 1ª importação
import Tela1 from './screens/Tela1';
import Tela2 from './screens/Tela2';
// opcional: ícones
import { Ionicons } from '@expo/vector-icons';

const Drawer = createDrawerNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Drawer.Navigator initialRouteName="Tela1"
        screenOptions={{
          headerTitleAlign: 'center',
        }}
      >
        <Drawer.Screen
          name="Tela1"
          component={Tela1}
          options={{
            title: 'Tela 1',
            drawerIcon: ({ size, color }) => <Ionicons name="home-outline" size={size} color={color} />,
          }}
        />
        <Drawer.Screen
          name="Tela2"
          component={Tela2}
          options={{
            title: 'Tela 2',
            drawerIcon: ({ size, color }) => <Ionicons name="list-outline" size={size} color={color} />,
          }}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
