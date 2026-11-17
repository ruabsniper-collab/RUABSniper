import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { installNotificationNavigation } from "../lib/notificationNavigation";
import { traceNotification } from "../lib/notificationTrace";

export function NotificationNavigation() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => installNotificationNavigation((url) => navigateRef.current(url, { replace: true })), []);
  useEffect(() => {
    if (pathname === "/register") traceNotification("route-rendered", pathname + search);
  }, [pathname, search]);
  return null;
}
