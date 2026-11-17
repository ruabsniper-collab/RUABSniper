import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { installNotificationNavigation } from "../lib/notificationNavigation";

export function NotificationNavigation() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => installNotificationNavigation((url) => navigateRef.current(url, { replace: true })), []);
  return null;
}
