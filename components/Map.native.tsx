import { StyleSheet, View, ActivityIndicator, TouchableOpacity, Text, Image, Animated, TextInput, useWindowDimensions, AppState, Platform, KeyboardAvoidingView, Keyboard } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Region, Marker, Polyline } from 'react-native-maps';

const ALERTS = [
  { id: 'Theft', label: 'Theft', icon: require('@/assets/alert-icons/Theft.png') },
  { id: 'Harm', label: 'Harm', icon: require('@/assets/alert-icons/Harm.png') },
  { id: 'Bad Infrastructure', label: 'Bad Infrastructure', icon: require('@/assets/alert-icons/Bad_Infrastructure.png') },
  { id: 'Dark Area', label: 'Dark Area', icon: require('@/assets/alert-icons/Dark_Area.png') },
  { id: 'Fire', label: 'Fire', icon: require('@/assets/alert-icons/Fire.png') },
];

const PIN_ICONS: Record<string, any> = {
  'Bad Infrastructure': require('@/assets/pin-icons/Bad Infrastructure Pin Icon Large.png'),
  'Fire': require('@/assets/pin-icons/Fire Pin Icon Large.png'),
  'Harm': require('@/assets/pin-icons/Harm Pin Icon Large.png'),
  'Theft': require('@/assets/pin-icons/Theft Pin Icon Large.png'),
  'Dark Area': require('@/assets/pin-icons/Dark Area Pin Icon Large.png'),
};

const API_HOST_URL = 'https://undenotable-cyrus-nemoricole.ngrok-free.dev';
const API_BASE_URL = `${API_HOST_URL}/api/v1`;
const SESSION_ID = Math.random().toString(36).substring(2, 15);
const API_COMMON_HEADERS = {
  'ngrok-skip-browser-warning': 'true',
};

const ALERT_ID_TO_TYPE_ID: Record<string, number> = {
  'Theft': 1,
  'Harm': 2,
  'Bad Infrastructure': 3,
  'Dark Area': 4,
  'Fire': 5,
};

const TYPE_ID_TO_ALERT_ID: Record<number, string> = {
  1: 'Theft',
  2: 'Harm',
  3: 'Bad Infrastructure',
  4: 'Dark Area',
  5: 'Fire',
};

const EARTH_RADIUS_KM = 6371;
const SEARCH_RADIUS_KM = 20;
const ROUTE_ALERT_MAX_POINTS = 40;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const getDistanceKm = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) => {
  const latDistance = toRadians(toLatitude - fromLatitude);
  const lonDistance = toRadians(toLongitude - fromLongitude);
  const fromLatInRadians = toRadians(fromLatitude);
  const toLatInRadians = toRadians(toLatitude);

  const a =
    Math.sin(latDistance / 2) * Math.sin(latDistance / 2) +
    Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2) *
      Math.cos(fromLatInRadians) * Math.cos(toLatInRadians);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

const decodePolyline = (encodedPolyline: string) => {
  const coordinates: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encodedPolyline.length) {
    let result = 0;
    let shift = 0;
    let byteValue;

    do {
      byteValue = encodedPolyline.charCodeAt(index++) - 63;
      result |= (byteValue & 0x1f) << shift;
      shift += 5;
    } while (byteValue >= 0x20);

    const deltaLatitude = result & 1 ? ~(result >> 1) : result >> 1;
    latitude += deltaLatitude;

    result = 0;
    shift = 0;

    do {
      byteValue = encodedPolyline.charCodeAt(index++) - 63;
      result |= (byteValue & 0x1f) << shift;
      shift += 5;
    } while (byteValue >= 0x20);

    const deltaLongitude = result & 1 ? ~(result >> 1) : result >> 1;
    longitude += deltaLongitude;

    coordinates.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return coordinates;
};

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useWebSocket } from '../hooks/useWebSocket';
import { useThemeContext } from '../context/ThemeContext';

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  {
    featureType: 'administrative.country',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#4b6878' }],
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64779e' }],
  },
  {
    featureType: 'administrative.province',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#4b6878' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#334e87' }],
  },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#023e58' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#283d6a' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6f9ba5' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#1d2c4d' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry.fill',
    stylers: [{ color: '#023e58' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3c7680' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#304a7d' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#98a5be' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#1d2c4d' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2c6675' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#255763' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#b0d5ce' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#023e58' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#98a5be' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#1d2c4d' }],
  },
  {
    featureType: 'transit.line',
    elementType: 'geometry.fill',
    stylers: [{ color: '#283d6a' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'geometry',
    stylers: [{ color: '#3a4762' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0e1626' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4e6d70' }],
  },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function Map() {
  type SearchSuggestion = {
    id: string;
    label: string;
    subtitle: string;
    latitude: number;
    longitude: number;
  };

  const { colorScheme } = useThemeContext();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';
  const { width: windowWidth } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const followSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const promptedAlertIdsRef = useRef<Set<string>>(new Set());
  const [region, setRegion] = useState<Region | null>(null);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [showFloatingButtons, setShowFloatingButtons] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentUserLocation, setCurrentUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [walkingRouteCoords, setWalkingRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [isPromptSuppressed, setIsPromptSuppressed] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [inAppVotePrompt, setInAppVotePrompt] = useState<{ id: string; type: string } | null>(null);
  const [inAppVoteQueue, setInAppVoteQueue] = useState<Array<{ id: string; type: string }>>([]);
  const searchWidthAnim = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const promptSuppressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [reports, setReports] = useState<{ id: string; type: string; latitude: number; longitude: number; timestamp: number; creatorSessionId?: string }[]>([]);
  const [pendingLocation, setPendingLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const { sendLocation, initialAlerts, newAlert } = useWebSocket(SESSION_ID);
  const lastLocationPushRef = useRef<{ latitude: number; longitude: number; ts: number } | null>(null);
  const routeOverlayReportsRef = useRef<{ id: string; type: string; latitude: number; longitude: number; timestamp: number; creatorSessionId?: string }[]>([]);

  const [selectedReport, setSelectedReport] = useState<any>(null);

  const suppressPromptsForRouteAlerts = useCallback((durationMs: number = 5000) => {
    if (promptSuppressionTimerRef.current) {
      clearTimeout(promptSuppressionTimerRef.current);
      promptSuppressionTimerRef.current = null;
    }

    setIsPromptSuppressed(true);
    promptSuppressionTimerRef.current = setTimeout(() => {
      setIsPromptSuppressed(false);
      promptSuppressionTimerRef.current = null;
    }, durationMs);
  }, []);

  const toReport = useCallback((item: any) => ({
    id: item.alertId.toString(),
    type: TYPE_ID_TO_ALERT_ID[item.typeId] || 'Fire',
    latitude: item.latitude,
    longitude: item.longitude,
    timestamp: new Date(item.timeOfReport || Date.now()).getTime(),
    creatorSessionId: item.creatorSessionId,
  }), []);

  const dedupeReports = useCallback((items: { id: string; type: string; latitude: number; longitude: number; timestamp: number; creatorSessionId?: string }[]) => {
    const reportById = new globalThis.Map<string, { id: string; type: string; latitude: number; longitude: number; timestamp: number; creatorSessionId?: string }>();
    items.forEach((report) => {
      reportById.set(report.id, report);
    });
    return Array.from(reportById.values());
  }, []);

  // Bottom Sheet Ref & Setup
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const detailsBottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['50%', '90%'], []);
  const detailsSnapPoints = snapPoints;
  
  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleDismissModalPress = useCallback(() => {
    bottomSheetModalRef.current?.dismiss();
  }, []);

  const handlePresentDetailsModalPress = useCallback((report: any) => {
    setSelectedReport(report);
    detailsBottomSheetModalRef.current?.present();
  }, []);

  const handleDismissDetailsModalPress = useCallback(() => {
    detailsBottomSheetModalRef.current?.dismiss();
    setSelectedReport(null);
  }, []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  const handleNotificationResponse = async (
    response: 'still_there' | 'not_there',
    alertId?: string,
    notificationId?: string
  ) => {
    console.log('User responded to OS notification:', response);

    // Remove the tapped notification from the OS notification center.
    if (notificationId) {
      try {
        await Notifications.dismissNotificationAsync(notificationId);
      } catch (error) {
        console.warn('Could not dismiss notification:', error);
      }
    }

    if (!alertId) {
      return;
    }

    const vote = response === 'still_there' ? 'STILL_THERE' : 'NOT_THERE';

    try {
      const responseVote = await fetch(`${API_BASE_URL}/alerts/${encodeURIComponent(alertId)}/vote`, {
        method: 'POST',
        headers: {
          ...API_COMMON_HEADERS,
          'Content-Type': 'application/json',
          'X-Session-Id': SESSION_ID,
        },
        body: JSON.stringify({ vote }),
      });

      if (!responseVote.ok) {
        console.error('Failed to send vote', await responseVote.text());
      }
    } catch (error) {
      console.error('Error sending vote:', error);
    }
  };

  const showInAppVotePrompt = useCallback((reportsToPrompt: Array<{ id: string; type: string }>) => {
    setInAppVoteQueue((prev) => {
      const existing = new Set(prev.map((item) => item.id));
      const toAppend = reportsToPrompt.filter((item) => !existing.has(item.id));
      return [...prev, ...toAppend];
    });
  }, []);

  const handleInAppVote = useCallback((vote: 'still_there' | 'not_there') => {
    if (!inAppVotePrompt) {
      return;
    }

    const alertId = inAppVotePrompt.id;
    setInAppVotePrompt(null);
    void handleNotificationResponse(vote, alertId);
  }, [inAppVotePrompt]);

  const showBackgroundVoteNotification = useCallback(async (report: { id: string; type: string }) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Alert nearby',
        body: `Is ${report.type} still there?`,
        categoryIdentifier: 'alert_proximity',
        sound: true,
        data: { alertId: report.id },
      },
      trigger: Platform.OS === 'android'
        ? { seconds: 1, channelId: 'alerts-vote' }
        : null,
    });
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const actionIdentifier = response.actionIdentifier;
      const notificationId = response.notification.request.identifier;
      const alertIdValue = response.notification.request.content.data?.alertId;
      const alertId = typeof alertIdValue === 'number' ? alertIdValue.toString() : typeof alertIdValue === 'string' ? alertIdValue : undefined;

      if (actionIdentifier === 'still_there' || actionIdentifier === 'not_there') {
        void handleNotificationResponse(actionIdentifier, alertId, notificationId);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(keyboardShowEvent, (event) => {
      const keyboardHeight = event.endCoordinates?.height ?? 0;
      // Keep a small spacing between the search bar and keyboard.
      setKeyboardOffset(Math.max(0, keyboardHeight - 14));
    });

    const onHide = Keyboard.addListener(keyboardHideEvent, () => {
      setKeyboardOffset(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    if (!initialAlerts.length) {
      return;
    }

    setReports(dedupeReports(initialAlerts.map(toReport)));
  }, [initialAlerts, toReport, dedupeReports]);

  useEffect(() => {
    if (!newAlert) {
      return;
    }

    const incomingReport = toReport(newAlert);

    if (
      incomingReport.creatorSessionId !== SESSION_ID &&
      !promptedAlertIdsRef.current.has(incomingReport.id)
    ) {
      promptedAlertIdsRef.current.add(incomingReport.id);

      if (appStateRef.current === 'active') {
        showInAppVotePrompt([{ id: incomingReport.id, type: incomingReport.type }]);
      } else {
        void showBackgroundVoteNotification({ id: incomingReport.id, type: incomingReport.type });
      }
    }

    setReports(prev => {
      if (prev.some(report => report.id === incomingReport.id)) {
        return prev;
      }

      const optimisticIndex = prev.findIndex((report) => {
        if (report.creatorSessionId !== SESSION_ID || incomingReport.creatorSessionId !== SESSION_ID) {
          return false;
        }

        const sameType = report.type === incomingReport.type;
        const sameLocation = Math.abs(report.latitude - incomingReport.latitude) < 0.00001 && Math.abs(report.longitude - incomingReport.longitude) < 0.00001;
        return sameType && sameLocation;
      });

      if (optimisticIndex >= 0) {
        const next = [...prev];
        next[optimisticIndex] = incomingReport;
        return dedupeReports(next);
      }

      return dedupeReports([...prev, incomingReport]);
    });
  }, [newAlert, toReport, dedupeReports, showBackgroundVoteNotification, showInAppVotePrompt]);

  useEffect(() => {
    return () => {
      if (promptSuppressionTimerRef.current) {
        clearTimeout(promptSuppressionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const unseenReports = reports.filter((report) => {
      if (report.creatorSessionId === SESSION_ID) {
        return false;
      }

      return !promptedAlertIdsRef.current.has(report.id);
    });
    if (walkingRouteCoords.length > 1 || isPromptSuppressed || !unseenReports.length) {
      return;
    }

    if (appStateRef.current === 'active') {
      unseenReports.forEach((report) => {
        promptedAlertIdsRef.current.add(report.id);
      });
      showInAppVotePrompt(unseenReports);
      return;
    }

    unseenReports.forEach((report) => {
      promptedAlertIdsRef.current.add(report.id);
      void showBackgroundVoteNotification(report);
    });
  }, [reports, showBackgroundVoteNotification, showInAppVotePrompt, walkingRouteCoords.length, isPromptSuppressed]);

  useEffect(() => {
    if (walkingRouteCoords.length > 1 || isPromptSuppressed || inAppVotePrompt || inAppVoteQueue.length === 0) {
      return;
    }

    const [nextPrompt, ...rest] = inAppVoteQueue;
    setInAppVotePrompt(nextPrompt);
    setInAppVoteQueue(rest);
  }, [inAppVotePrompt, inAppVoteQueue, walkingRouteCoords.length, isPromptSuppressed]);

  const pushLocationUpdate = useCallback((latitude: number, longitude: number) => {
    const now = Date.now();
    const last = lastLocationPushRef.current;
    if (last) {
      const msSinceLast = now - last.ts;
      const movedEnough = Math.abs(last.latitude - latitude) > 0.0005 || Math.abs(last.longitude - longitude) > 0.0005;

      if (msSinceLast < 5000 && !movedEnough) {
        return;
      }
    }

    sendLocation(longitude, latitude);
    lastLocationPushRef.current = { latitude, longitude, ts: now };
  }, [sendLocation]);


  const fetchNearbyAlerts = useCallback(async (lat: number, lon: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/alerts/nearby?latitude=${lat}&longitude=${lon}`, {
        headers: {
          ...API_COMMON_HEADERS,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const mappedReports = data.map((item: any) => toReport(item));
        setReports(dedupeReports([...mappedReports, ...routeOverlayReportsRef.current]));
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  }, [toReport, dedupeReports]);

  const fetchAlertsAlongRoute = useCallback(async (routePoints: { latitude: number; longitude: number }[]) => {
    if (!routePoints.length) {
      return;
    }

    const stride = Math.max(1, Math.ceil(routePoints.length / ROUTE_ALERT_MAX_POINTS));
    const sampledPoints = routePoints.filter((_, index) => index % stride === 0);

    // Always include final destination point.
    const lastPoint = routePoints[routePoints.length - 1];
    if (
      sampledPoints.length === 0 ||
      sampledPoints[sampledPoints.length - 1].latitude !== lastPoint.latitude ||
      sampledPoints[sampledPoints.length - 1].longitude !== lastPoint.longitude
    ) {
      sampledPoints.push(lastPoint);
    }

    try {
      const responses = await Promise.allSettled(
        sampledPoints.map((point) =>
          fetch(`${API_BASE_URL}/alerts/nearby?latitude=${point.latitude}&longitude=${point.longitude}`, {
            headers: {
              ...API_COMMON_HEADERS,
            },
          }),
        ),
      );

      const collectedAlerts: any[] = [];

      for (const responseResult of responses) {
        if (responseResult.status !== 'fulfilled') {
          continue;
        }

        const response = responseResult.value;
        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        if (Array.isArray(data)) {
          collectedAlerts.push(...data);
        }
      }

      const mappedRouteReports = collectedAlerts.map((item: any) => toReport(item));
      const dedupedRouteReports = dedupeReports(mappedRouteReports);
      routeOverlayReportsRef.current = dedupedRouteReports;

      // Keep baseline behavior: always start from alerts near the user's current location.
      let mappedNearbyReports: { id: string; type: string; latitude: number; longitude: number; timestamp: number; creatorSessionId?: string }[] = [];
      if (currentUserLocation) {
        const nearbyResponse = await fetch(
          `${API_BASE_URL}/alerts/nearby?latitude=${currentUserLocation.latitude}&longitude=${currentUserLocation.longitude}`,
          {
            headers: {
              ...API_COMMON_HEADERS,
            },
          },
        );

        if (nearbyResponse.ok) {
          const nearbyData = await nearbyResponse.json();
          if (Array.isArray(nearbyData)) {
            mappedNearbyReports = nearbyData.map((item: any) => toReport(item));
          }
        }
      }

      // Route view = nearby current-location alerts + alerts that overlap sampled route points.
      setReports(dedupeReports([...mappedNearbyReports, ...dedupedRouteReports]));
    } catch (error) {
      console.error('Error fetching alerts along route:', error);
    }
  }, [toReport, dedupeReports, currentUserLocation]);

  const handleReportPress = async () => {
    try {
      let location = await Location.getCurrentPositionAsync({});
      setPendingLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      handlePresentModalPress();
    } catch (error) {
      console.warn('Could not get precise location for the report', error);
      if (region) {
        setPendingLocation({
          latitude: region.latitude,
          longitude: region.longitude,
        });
        handlePresentModalPress();
      }
    }
  };

  const handleCreateReport = async (type: string) => {
    if (pendingLocation) {
      const typeId = ALERT_ID_TO_TYPE_ID[type] || 1;
      const optimisticId = Math.random().toString();

      const newReport = {
        id: optimisticId,
        type,
        latitude: pendingLocation.latitude,
        longitude: pendingLocation.longitude,
        timestamp: Date.now(),
        creatorSessionId: SESSION_ID,
      };

      setReports(prev => [...prev, newReport]);
      handleDismissModalPress();

      try {
        const response = await fetch(`${API_BASE_URL}/alerts`, {
          method: 'POST',
          headers: {
            ...API_COMMON_HEADERS,
            'Content-Type': 'application/json',
            'X-Session-Id': SESSION_ID,
          },
          body: JSON.stringify({
            typeId,
            latitude: pendingLocation.latitude,
            longitude: pendingLocation.longitude,
          }),
        });

        if (response.ok) {
          const createdAlert = await response.json();
          const createdId = createdAlert.alertId.toString();
          setReports(prev => {
            const withoutOptimistic = prev.filter(r => r.id !== optimisticId);
            if (withoutOptimistic.some(r => r.id === createdId)) {
              return withoutOptimistic;
            }

            const optimisticReport = prev.find(r => r.id === optimisticId);
            if (!optimisticReport) {
              return withoutOptimistic;
            }

            return [...withoutOptimistic, { ...optimisticReport, id: createdId }];
          });
        } else {
          console.error('Failed to create alert', await response.text());
        }
      } catch (error) {
        console.error('Error creating report:', error);
      }
    }
  };

  const handleDeleteReport = async (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
    setSelectedReport(null);

    try {
      const response = await fetch(`${API_BASE_URL}/alerts/${id}`, {
        method: 'DELETE',
        headers: {
          ...API_COMMON_HEADERS,
          'X-Session-Id': SESSION_ID,
        },
      });
      if (!response.ok) {
        console.error('Failed to delete report on server', await response.text());
      }
    } catch (error) {
      console.error('Error deleting report:', error);
    }
  };

  useEffect(() => {
    (async () => {
      // Notification permissions and setup
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalNotificationStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalNotificationStatus = status;
      }

      if (finalNotificationStatus === 'granted') {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('alerts-vote', {
            name: 'Alert Votes',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 150, 250],
            lightColor: '#0288d1',
            sound: 'default',
          });
        }

        await Notifications.setNotificationCategoryAsync('alert_proximity', [
          {
            identifier: 'not_there',
            buttonTitle: 'Not there',
            options: { opensAppToForeground: false },
          },
          {
            identifier: 'still_there',
            buttonTitle: 'Still there',
            options: { opensAppToForeground: false, isDestructive: true },
          },
        ]);
      }

      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access location was denied');
        setRegion({
          latitude: 42.6977, // Sofia coordinates by default
          longitude: 23.3219,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
        fetchNearbyAlerts(42.6977, 23.3219);
        return;
      }

      try {
        let location = await Location.getCurrentPositionAsync({});
        setCurrentUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        setRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
        fetchNearbyAlerts(location.coords.latitude, location.coords.longitude);
        pushLocationUpdate(location.coords.latitude, location.coords.longitude);
      } catch (error) {
        console.warn('Error fetching location:', error);
        // Fallback to Sofia if an error occurs but permissions were granted
        setRegion({
          latitude: 42.6977,
          longitude: 23.3219,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
        fetchNearbyAlerts(42.6977, 23.3219);
        pushLocationUpdate(42.6977, 23.3219);
      }
    })();
  }, [pushLocationUpdate, fetchNearbyAlerts]);

  const handleRegionChangeComplete = useCallback((_r: Region) => {
    if (!currentUserLocation) {
      return;
    }

    // Keep baseline behavior tied to user location instead of map viewport.
    fetchNearbyAlerts(currentUserLocation.latitude, currentUserLocation.longitude);
  }, [fetchNearbyAlerts, currentUserLocation]);

  const stopFollowingUser = useCallback(() => {
    if (!isFollowingUser) {
      return;
    }
    setIsFollowingUser(false);
  }, [isFollowingUser]);

  useEffect(() => {
    if (!isFollowingUser) {
      followSubscriptionRef.current?.remove();
      followSubscriptionRef.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 5,
            timeInterval: 1500,
          },
          (position) => {
            if (!isFollowingUser) {
              return;
            }

            const nextRegion: Region = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            };

            setRegion(nextRegion);
            setCurrentUserLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
            mapRef.current?.animateToRegion(nextRegion, 500);
            pushLocationUpdate(nextRegion.latitude, nextRegion.longitude);
          }
        );

        if (cancelled) {
          subscription.remove();
          return;
        }

        followSubscriptionRef.current = subscription;
      } catch (error) {
        console.warn('Unable to start follow mode', error);
        setIsFollowingUser(false);
      }
    })();

    return () => {
      cancelled = true;
      followSubscriptionRef.current?.remove();
      followSubscriptionRef.current = null;
    };
  }, [isFollowingUser, pushLocationUpdate]);

  const handleCenterMapPress = useCallback(async () => {
    setIsFollowingUser(true);

    try {
      const location = await Location.getCurrentPositionAsync({});
      const nextRegion: Region = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };

      setCurrentUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 450);
    } catch {
      if (region) {
        mapRef.current?.animateToRegion(region, 450);
      }
    }
  }, [region]);

  const handleMapPanDrag = useCallback(() => {
    stopFollowingUser();
  }, [stopFollowingUser]);

  const handleMapRegionChangeComplete = useCallback((r: Region, details?: { isGesture?: boolean }) => {
    if (details?.isGesture) {
      stopFollowingUser();
    }

    handleRegionChangeComplete(r);
  }, [handleRegionChangeComplete, stopFollowingUser]);

  const animateSearchState = useCallback((expand: boolean) => {
    if (!expand) {
      setShowFloatingButtons(true);
    }

    Animated.timing(searchWidthAnim, {
      toValue: expand ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start(() => {
      if (expand) {
        setShowFloatingButtons(false);
        searchInputRef.current?.focus();
      } else {
        searchInputRef.current?.blur();
      }
    });
  }, [searchWidthAnim]);

  const handleSearchToggle = useCallback(() => {
    setIsSearchExpanded(prev => {
      const next = !prev;

      if (!next) {
        setShowSuggestions(false);
      }

      animateSearchState(next);
      return next;
    });
  }, [animateSearchState]);

  const handleMapPress = useCallback(() => {
    if (showSuggestions) {
      setShowSuggestions(false);
      Keyboard.dismiss();
    }

    if (isSearchExpanded) {
      setIsSearchExpanded(false);
      animateSearchState(false);
    }
  }, [isSearchExpanded, animateSearchState, showSuggestions]);

  const handleBuildWalkingRoute = useCallback(async (destinationLatitude: number, destinationLongitude: number) => {
    const routeOrigin = currentUserLocation ?? (region
      ? { latitude: region.latitude, longitude: region.longitude }
      : null);

    if (!routeOrigin) {
      console.warn('Cannot build route: current user location is not available yet.');
      return;
    }

    const googleApiKey =
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
      null;

    if (!googleApiKey) {
      console.warn('Cannot build route: missing Google Maps API key. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
      return;
    }

    try {
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleApiKey,
          'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: routeOrigin.latitude,
                longitude: routeOrigin.longitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: destinationLatitude,
                longitude: destinationLongitude,
              },
            },
          },
          travelMode: 'WALK',
          computeAlternativeRoutes: false,
          units: 'METRIC',
          languageCode: 'en-US',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Routes API failed (${response.status}): ${errorBody}`);
      }

      const result = await response.json();
      const encodedPolyline = result?.routes?.[0]?.polyline?.encodedPolyline;

      if (!encodedPolyline || typeof encodedPolyline !== 'string') {
        routeOverlayReportsRef.current = [];
        setWalkingRouteCoords([]);
        if (currentUserLocation) {
          await fetchNearbyAlerts(currentUserLocation.latitude, currentUserLocation.longitude);
        }
        return;
      }

      const decodedRoute = decodePolyline(encodedPolyline);
      setWalkingRouteCoords(decodedRoute);
      await fetchAlertsAlongRoute(decodedRoute);

      if (decodedRoute.length > 1) {
        mapRef.current?.fitToCoordinates(decodedRoute, {
          edgePadding: { top: 110, right: 60, bottom: 180, left: 60 },
          animated: true,
        });
      }
    } catch (error) {
      console.warn('Failed to compute walking route', error);
      routeOverlayReportsRef.current = [];
      setWalkingRouteCoords([]);
      if (currentUserLocation) {
        await fetchNearbyAlerts(currentUserLocation.latitude, currentUserLocation.longitude);
      }
    }
  }, [currentUserLocation, region, fetchAlertsAlongRoute, fetchNearbyAlerts]);

  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    const nextRegion: Region = {
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    };

    suppressPromptsForRouteAlerts(5000);
    setInAppVotePrompt(null);
    setInAppVoteQueue([]);
    setIsSearchExpanded(false);
    animateSearchState(false);
    Keyboard.dismiss();
    setSearchQuery(suggestion.label);
    setShowSuggestions(false);
    setRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 450);
    void handleBuildWalkingRoute(nextRegion.latitude, nextRegion.longitude);
  }, [handleBuildWalkingRoute, animateSearchState, suppressPromptsForRouteAlerts]);

  const handleClearSelectedRoute = useCallback(() => {
    suppressPromptsForRouteAlerts(5000);
    routeOverlayReportsRef.current = [];
    setWalkingRouteCoords([]);

    if (currentUserLocation) {
      void fetchNearbyAlerts(currentUserLocation.latitude, currentUserLocation.longitude);
    }

    void handleCenterMapPress();
  }, [currentUserLocation, fetchNearbyAlerts, handleCenterMapPress, suppressPromptsForRouteAlerts]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (!isSearchExpanded || query.length < 2) {
      searchAbortControllerRef.current?.abort();
      setIsLoadingSuggestions(false);
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (!currentUserLocation) {
      setIsLoadingSuggestions(false);
      setSearchSuggestions([]);
      setShowSuggestions(true);
      return;
    }

    setIsLoadingSuggestions(true);
    setShowSuggestions(true);

    const timeoutId = setTimeout(async () => {
      try {
        searchAbortControllerRef.current?.abort();
        const controller = new AbortController();
        searchAbortControllerRef.current = controller;

        const response = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=en&lat=${currentUserLocation.latitude}&lon=${currentUserLocation.longitude}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Suggestion request failed with status ${response.status}`);
        }

        const results = await response.json();
        const mappedSuggestions = (Array.isArray(results?.features) ? results.features : [])
          .map((feature: any) => {
            const name = typeof feature?.properties?.name === 'string' ? feature.properties.name : query;
            const city = typeof feature?.properties?.city === 'string' ? feature.properties.city : '';
            const country = typeof feature?.properties?.country === 'string' ? feature.properties.country : '';
            const subtitle = [city, country].filter(Boolean).join(', ');
            const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];

            return {
              id: String(feature?.properties?.osm_id ?? `${name}-${coordinates[1]}-${coordinates[0]}`),
              label: name,
              subtitle,
              latitude: Number(coordinates[1]),
              longitude: Number(coordinates[0]),
            };
          })
          .filter((item: SearchSuggestion) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
          .filter((item: SearchSuggestion) => {
            const distanceKm = getDistanceKm(
              currentUserLocation.latitude,
              currentUserLocation.longitude,
              item.latitude,
              item.longitude,
            );

            return distanceKm <= SEARCH_RADIUS_KM;
          });

        setSearchSuggestions(mappedSuggestions);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.warn('Failed to load search suggestions', error);
          setSearchSuggestions([]);
        }
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [searchQuery, isSearchExpanded, currentUserLocation]);

  useEffect(() => {
    return () => {
      searchAbortControllerRef.current?.abort();
    };
  }, []);

  const expandedSearchWidth = Math.max(58, windowWidth - 36);

  const searchContainerWidth = searchWidthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [58, expandedSearchWidth],
  });

  const searchInputOpacity = searchWidthAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.25, 1],
  });

  const floatingButtonsOpacity = searchWidthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const floatingButtonsScale = searchWidthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.86],
  });

  if (!region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {inAppVotePrompt && walkingRouteCoords.length <= 1 && !isPromptSuppressed && (
        <View style={styles.inAppPromptContainer} pointerEvents="box-none">
          <View style={styles.inAppPromptCard}>
            <Text style={styles.inAppPromptTitle}>Is this alert still there?</Text>
            <Text style={styles.inAppPromptBody}>{inAppVotePrompt.type} reported nearby.</Text>
            <View style={styles.inAppPromptActions}>
              <TouchableOpacity style={styles.inAppPromptSecondaryButton} onPress={() => handleInAppVote('not_there')}>
                <Text style={styles.inAppPromptSecondaryText}>Not there</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inAppPromptPrimaryButton} onPress={() => handleInAppVote('still_there')}>
                <Text style={styles.inAppPromptPrimaryText}>Still there</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <MapView
        key={`map-${colorScheme}`}
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
        initialRegion={region}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        mapPadding={{ top: 60, right: 10, bottom: 0, left: 0 }}
        followsUserLocation={false}
        toolbarEnabled={false}
        onPanDrag={handleMapPanDrag}
        onPress={handleMapPress}
        onRegionChangeComplete={handleMapRegionChangeComplete}
      >
        {walkingRouteCoords.length > 1 && (
          <Polyline
            coordinates={walkingRouteCoords}
            strokeColor={isDark ? '#6dc6ff' : '#0f6bdc'}
            strokeWidth={5}
          />
        )}

        {reports.map((report) => (
          <Marker
            key={`${report.id}-${report.timestamp}-${report.latitude}-${report.longitude}`}
            coordinate={{ latitude: report.latitude, longitude: report.longitude }}
            anchor={{ x: 0.5, y: 1 }}
            onPress={(e) => {
              e.stopPropagation();
              handlePresentDetailsModalPress(report);
            }}
          >
            <View style={styles.markerContainer}>
              <Image
                source={PIN_ICONS[report.type] || PIN_ICONS['Fire']}
                style={styles.markerIcon}
                resizeMode="contain"
              />
            </View>
          </Marker>
        ))}
      </MapView>

      {showFloatingButtons && (
        <Animated.View
          style={[styles.reportButtonContainer, { opacity: floatingButtonsOpacity, transform: [{ scale: floatingButtonsScale }] }]}
          pointerEvents={isSearchExpanded ? 'none' : 'auto'}
        >
          <TouchableOpacity style={styles.reportButton} onPress={handleReportPress}>
            <Text style={styles.reportButtonText}>Report</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {showFloatingButtons && (
        <Animated.View
          style={[styles.centerMapButtonContainer, { opacity: floatingButtonsOpacity, transform: [{ scale: floatingButtonsScale }] }]}
          pointerEvents={isSearchExpanded ? 'none' : 'auto'}
        >
          <TouchableOpacity style={[styles.centerMapButton, isFollowingUser && styles.centerMapButtonActive]} onPress={handleCenterMapPress}>
            <MaterialCommunityIcons name="crosshairs-gps" size={34} color="#ffffff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {walkingRouteCoords.length > 1 && (
        <View
          style={[
            styles.clearRouteButtonContainer,
            { top: insets.top ? insets.top + 10 : 20 },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity style={styles.clearRouteButton} onPress={handleClearSelectedRoute}>
            <MaterialCommunityIcons name="close" size={26} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.searchButtonContainer, { bottom: 28 + keyboardOffset }]}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.searchButtonShell, { width: searchContainerWidth }]}>
          <TouchableOpacity style={styles.searchIconButton} onPress={handleSearchToggle}>
            <MaterialCommunityIcons name="magnify" size={28} color="#ffffff" />
          </TouchableOpacity>
          <Animated.View style={[styles.searchInputWrap, { opacity: searchInputOpacity }]} pointerEvents={isSearchExpanded ? 'auto' : 'none'}>
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                if (!showSuggestions) {
                  setShowSuggestions(true);
                }
              }}
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="rgba(255,255,255,0.72)"
              returnKeyType="search"
              onFocus={() => {
                if (searchQuery.trim().length >= 2) {
                  setShowSuggestions(true);
                }
              }}
              onSubmitEditing={() => {
                if (searchSuggestions.length > 0) {
                  handleSuggestionSelect(searchSuggestions[0]);
                }
              }}
            />
          </Animated.View>
        </Animated.View>

        {showSuggestions && (isLoadingSuggestions || searchSuggestions.length > 0 || searchQuery.trim().length >= 2) && (
          <Animated.View style={[styles.searchSuggestionsContainer, { width: searchContainerWidth }]}>
            {isLoadingSuggestions ? (
              <View style={styles.searchSuggestionItem}>
                <Text style={styles.searchSuggestionTitle}>Searching...</Text>
              </View>
            ) : searchSuggestions.length === 0 ? (
              <View style={styles.searchSuggestionItem}>
                <Text style={styles.searchSuggestionTitle}>No places found</Text>
              </View>
            ) : (
              searchSuggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion.id}
                  style={styles.searchSuggestionItem}
                  onPress={() => handleSuggestionSelect(suggestion)}
                >
                  <Text numberOfLines={1} style={styles.searchSuggestionTitle}>{suggestion.label}</Text>
                  {!!suggestion.subtitle && (
                    <Text numberOfLines={1} style={styles.searchSuggestionSubtitle}>{suggestion.subtitle}</Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </Animated.View>
        )}
      </KeyboardAvoidingView>

      {/* Report Bottom Sheet Modal */}
      <BottomSheetModal
        ref={bottomSheetModalRef}
        index={0}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        enableContentPanningGesture={false}
        handleComponent={() => (
          <View style={styles.customHandleContainer}>
            <View style={styles.customHandleGlow}>
              <View style={styles.customHandleBar} />
            </View>
          </View>
        )}
      >
        <BottomSheetView style={styles.bottomSheetContentContainer}>
          <Text style={styles.sheetTitle}>What do you want to report?</Text>
          <View style={styles.gridContainer}>
            {ALERTS.map(alert => (
              <TouchableOpacity
                key={alert.id}
                style={styles.gridItem}
                onPress={() => handleCreateReport(alert.id)}
              >
                <Image source={alert.icon} style={styles.gridIcon} resizeMode="contain" />
                <Text style={styles.gridText}>{alert.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      {/* Pin Details Bottom Sheet */}
      <BottomSheetModal
        ref={detailsBottomSheetModalRef}
        index={0}
        snapPoints={detailsSnapPoints}
        backdropComponent={renderBackdrop}
        onDismiss={() => setSelectedReport(null)}
        enableContentPanningGesture={false}
        handleComponent={() => (
          <View style={styles.customHandleContainer}>
            <View style={styles.customHandleGlow}>
              <View style={styles.customHandleBar} />
            </View>
          </View>
        )}
      >
        <BottomSheetView style={styles.bottomSheetDetails}>
          <View style={styles.detailsBody}>
            <Text style={styles.detailsSheetTitle}>Alert details</Text>
            <View style={styles.detailsContainer}>
              <Image
                source={ALERTS.find(a => a.id === selectedReport?.type)?.icon}
                style={styles.detailsIcon}
                resizeMode="contain"
              />
              <View style={styles.detailsTextContainer}>
                <Text style={styles.detailsLabel}>
                  {ALERTS.find(a => a.id === selectedReport?.type)?.label}
                </Text>
                <Text style={styles.detailsTime}>
                  {selectedReport ? new Date(selectedReport.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </Text>
                {selectedReport?.creatorSessionId === SESSION_ID && (
                  <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteReport(selectedReport.id)}>
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inAppPromptContainer: {
    position: 'absolute',
    top: 56,
    left: 14,
    right: 14,
    zIndex: 30,
  },
  inAppPromptCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  inAppPromptTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  inAppPromptBody: {
    marginTop: 4,
    fontSize: 14,
    color: '#424242',
  },
  inAppPromptActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  inAppPromptPrimaryButton: {
    backgroundColor: 'rgba(2, 136, 209, 0.95)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  inAppPromptPrimaryText: {
    color: '#fff',
    fontWeight: '700',
  },
  inAppPromptSecondaryButton: {
    backgroundColor: '#eeeeee',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  inAppPromptSecondaryText: {
    color: '#212121',
    fontWeight: '600',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportButtonContainer: {
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
    bottom: 28,
  },
  reportButton: {
    backgroundColor: 'rgba(255, 92, 92, 0.96)',
    minWidth: 112,
    minHeight: 58,
    paddingHorizontal: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
  },
  reportButtonText: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  centerMapButtonContainer: {
    position: 'absolute',
    right: 18,
    bottom: 28,
  },
  centerMapButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(16, 104, 184, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
    shadowOpacity: 0,
  },
  centerMapButtonActive: {
    backgroundColor: 'rgba(2, 136, 209, 0.98)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#03a9f4',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 14,
  },
  clearRouteButtonContainer: {
    position: 'absolute',
    right: 20,
  },
  clearRouteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(210, 47, 47, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  searchButtonContainer: {
    position: 'absolute',
    left: 18,
    bottom: 28,
  },
  searchButtonShell: {
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(92, 98, 108, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  searchIconButton: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputWrap: {
    flex: 1,
    paddingRight: 14,
  },
  searchInput: {
    color: '#fff',
    fontSize: 16,
    paddingVertical: 0,
  },
  searchSuggestionsContainer: {
    position: 'absolute',
    left: 0,
    bottom: 66,
    borderRadius: 16,
    backgroundColor: 'rgba(25, 30, 38, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  searchSuggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  searchSuggestionTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchSuggestionSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
  },
  bottomSheetContentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  customHandleContainer: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#fff',
  },
  customHandleGlow: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',  // Very soft grey background to act as the "glow/aura"
    shadowColor: '#ccc',         // Subtle glow drop shadow
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 4,
  },
  customHandleBar: {
    width: 40,
    height: 5,
    backgroundColor: '#bbb',
    borderRadius: 3,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 15,
  },
  gridItem: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 20,
  },
  gridIcon: {
    width: 50,
    height: 50,
    marginBottom: 8,
  },
  gridText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    color: '#333',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerIcon: {
    width: 20,
    height: 20,
  },
  bottomSheetDetails: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: 220,
    overflow: 'hidden',
  },
  detailsBody: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 8,
  },
  detailsSheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 14,
    color: '#111',
  },
  detailsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsIcon: {
    width: 60,
    height: 60,
    marginRight: 20,
  },
  detailsTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  detailsLabel: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  detailsTime: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  deleteButton: {
    backgroundColor: 'rgba(210, 47, 47, 0.95)',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignSelf: 'flex-start'
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: 'bold'
  },
});
