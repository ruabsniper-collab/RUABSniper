import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { SearchStackParamList, TabParamList } from "./types";
import { SearchScreen } from "../screens/SearchScreen";
import { CourseDetailScreen } from "../screens/CourseDetailScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { WatchesScreen } from "../screens/WatchesScreen";
import { MyScheduleScreen } from "../screens/MyScheduleScreen";
import { SettingsScreen } from "../screens/SettingsScreen";

const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function SearchStackNavigator() {
  return (
    <SearchStack.Navigator>
      <SearchStack.Screen name="Search" component={SearchScreen} options={{ title: "Course Search" }} />
      <SearchStack.Screen name="CourseDetail" component={CourseDetailScreen} options={{ title: "Course" }} />
      <SearchStack.Screen name="Register" component={RegisterScreen} options={{ title: "WebReg" }} />
    </SearchStack.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="SearchTab" component={SearchStackNavigator} options={{ title: "Search" }} />
      <Tab.Screen
        name="Watches"
        component={WatchesScreen}
        options={{ headerShown: true, title: "Watches" }}
      />
      <Tab.Screen
        name="MySchedule"
        component={MyScheduleScreen}
        options={{ headerShown: true, title: "My Schedule" }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: true, title: "Settings" }}
      />
    </Tab.Navigator>
  );
}
