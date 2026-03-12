import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { HomeScreen } from "@/screens/dashboard/HomeScreen";
import { ConversationsScreen } from "@/screens/dashboard/ConversationsScreen";
import { ChatScreen } from "@/screens/dashboard/ChatScreen";
import { OperationsScreen } from "@/screens/dashboard/OperationsScreen";

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Conversations: undefined;
  Chat: { phone: string; contactName?: string };
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#1e293b",
          borderTopColor: "#334155",
          borderTopWidth: 1,
          height: 62 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#6366f1",
        tabBarInactiveTintColor: "#64748b",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => {
          const iconName =
            route.name === "HomeTab"
              ? "grid"
              : route.name === "ConversationsTab"
                ? "chatbubble-ellipses"
                : "list-circle";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: "Dashboard" }}
      />
      <Tab.Screen
        name="ConversationsTab"
        component={ConversationsScreen}
        options={{ title: "Conversas" }}
      />
      <Tab.Screen
        name="OperationsTab"
        component={OperationsScreen}
        options={{ title: "Operações" }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { token } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0f172a" },
        }}
      >
        {token ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: "#1e293b" },
                headerTintColor: "#f1f5f9",
                headerTitleStyle: { fontWeight: "600", fontSize: 16 },
                animation: "slide_from_right",
              }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
