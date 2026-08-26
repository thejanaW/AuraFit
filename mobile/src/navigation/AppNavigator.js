import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { HabitsProvider } from '../context/HabitsContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import HabitsScreen from '../screens/HabitsScreen';
import MapScreen from '../screens/MapScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CouponsScreen from '../screens/CouponsScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Home: 'home',
  Habits: 'checkbox',
  Map: 'map',
};

function MainTabs() {
  return (
    // HabitsProvider sits above the tabs so Home and Habits share one live
    // copy of today's completion state (see HabitsContext.js)
    <HabitsProvider>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#131315',
            borderTopColor: '#2C2C2E',
          },
          tabBarActiveTintColor: '#FF5A36',
          tabBarInactiveTintColor: '#666',
          tabBarLabelStyle: { fontSize: 11 },
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? TAB_ICONS[route.name] : `${TAB_ICONS[route.name]}-outline`}
              size={size}
              color={color}
            />
          ),
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Habits" component={HabitsScreen} />
        <Tab.Screen name="Map" component={MapScreen} />
      </Tab.Navigator>
    </HabitsProvider>
  );
}

// Initial route is gated on whether the authed user already has a prediction
// on record (AuthContext resolves this via GET /api/predictions/latest right
// after restoring/creating the session) — Onboarding for a first-timer,
// MainTabs for a returning user. Screens still navigate freely between the
// two afterwards (Skip, Start My Analysis, Finish onboarding).
function AppStack({ initialRouteName }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRouteName}>
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="MainTabs" component={MainTabs} />
      {/* Not a tab — pushed on top from Home's profile icon, own back chevron */}
      <Stack.Screen name="Profile" component={ProfileScreen} />
      {/* Pushed from Profile's "My Coupons" row, same pattern as Profile itself */}
      <Stack.Screen name="Coupons" component={CouponsScreen} />
    </Stack.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading, hasPrediction } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#FF5A36" size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? (
        <AppStack initialRouteName={hasPrediction ? 'MainTabs' : 'Onboarding'} />
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}
