import { StyleSheet, View, ActivityIndicator, TouchableOpacity, Text, Image, Animated, TextInput, useWindowDimensions, AppState, Platform, KeyboardAvoidingView } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Region, Marker } from 'react-native-maps';

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

const API_HOST_URL = 'http://10.108.5.101:8080';
const API_BASE_URL = `${API_HOST_URL}/api/v1`;
const SESSION_ID = Math.random().toString(36).substring(2, 15);

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

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useWebSocket } from '../hooks/useWebSocket';

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
  const [inAppVotePrompt, setInAppVotePrompt] = useState<{ id: string; type: string } | null>(null);
  const [inAppVoteQueue, setInAppVoteQueue] = useState<Array<{ id: string; type: string }>>([]);
  const searchWidthAnim = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);

  const [reports, setReports] = useState<{ id: string; type: string; latitude: number; longitude: number; timestamp: number; creatorSessionId?: string }[]>([]);
  const [pendingLocation, setPendingLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const { sendLocation, initialAlerts, newAlert } = useWebSocket(SESSION_ID);
  const lastLocationPushRef = useRef<{ latitude: number; longitude: number; ts: number } | null>(null);

  const [selectedReport, setSelectedReport] = useState<any>(null);

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
    const unseenReports = reports.filter((report) => {
      if (report.creatorSessionId === SESSION_ID) {
        return false;
      }

      return !promptedAlertIdsRef.current.has(report.id);
    });
    if (!unseenReports.length) {
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
  }, [reports, showBackgroundVoteNotification, showInAppVotePrompt]);

  useEffect(() => {
    if (inAppVotePrompt || inAppVoteQueue.length === 0) {
      return;
    }

    const [nextPrompt, ...rest] = inAppVoteQueue;
    setInAppVotePrompt(nextPrompt);
    setInAppVoteQueue(rest);
  }, [inAppVotePrompt, inAppVoteQueue]);

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


  const fetchNearbyAlerts = async (lat: number, lon: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/alerts/nearby?latitude=${lat}&longitude=${lon}`);
      if (response.ok) {
        const data = await response.json();
        const mappedReports = data.map((item: any) => toReport(item));
        setReports(dedupeReports(mappedReports));
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

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
  }, [pushLocationUpdate]);

  const handleRegionChangeComplete = useCallback((r: Region) => {
    fetchNearbyAlerts(r.latitude, r.longitude);
    pushLocationUpdate(r.latitude, r.longitude);
  }, [pushLocationUpdate]);

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
      animateSearchState(next);
      return next;
    });
  }, [animateSearchState]);

  const handleMapPress = useCallback(() => {
    if (isSearchExpanded) {
      setIsSearchExpanded(false);
      animateSearchState(false);
    }
  }, [isSearchExpanded, animateSearchState]);

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
      {inAppVotePrompt && (
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
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={true}
        mapPadding={{ top: 60, right: 10, bottom: 0, left: 0 }}
        followsUserLocation={false}
        toolbarEnabled={false}
        onPanDrag={handleMapPanDrag}
        onPress={handleMapPress}
        onRegionChangeComplete={handleMapRegionChangeComplete}
      >
        {reports.map((report) => (
          <Marker
            key={`${report.id}-${report.timestamp}-${report.latitude}-${report.longitude}`}
            coordinate={{ latitude: report.latitude, longitude: report.longitude }}
            image={PIN_ICONS[report.type] || PIN_ICONS['Fire']}
            anchor={{ x: 0.5, y: 1 }}
            onPress={(e) => {
              e.stopPropagation();
              handlePresentDetailsModalPress(report);
            }}
          />
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

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.searchButtonContainer}
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
              onChangeText={setSearchQuery}
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="rgba(255,255,255,0.72)"
              returnKeyType="search"
            />
          </Animated.View>
        </Animated.View>
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
    width: 40,
    height: 40,
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
