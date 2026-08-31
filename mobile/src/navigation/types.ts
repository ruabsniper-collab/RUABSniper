import type { NavigatorScreenParams } from "@react-navigation/native";
import type { Term } from "../lib/term";

export type SearchStackParamList = {
  Search: undefined;
  CourseDetail: { courseId: string; term: Term };
  Register: { indexNumber: string; label: string };
};

export type TabParamList = {
  SearchTab: NavigatorScreenParams<SearchStackParamList>;
  Watches: undefined;
  MySchedule: undefined;
  Settings: undefined;
};
