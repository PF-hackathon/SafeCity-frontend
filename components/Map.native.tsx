import { StyleSheet, View, ActivityIndicator, TouchableOpacity, Text, Modal, Image, Platform } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Region, Marker } from 'react-native-maps';

const ALERTS = [
  { id: 'Theft', label: 'Theft', icon: require('@/assets/alert-icons/Theft.png') },
  { id: 'Harm', label: 'Harm', icon: require('@/assets/alert-icons/Harm.png') },
  { id: 'Bad Infrastructure', label: 'Bad Infrastructure', icon: require('@/assets/alert-icons/Bad_Infrastructure.png') },
  { id: 'Dark Area', label: 'Dark Area', icon: require('@/assets/alert-icons/Dark_Area.png') },
  { id: 'Fire', label: 'Fire', icon: require('@/assets/alert-icons/Fire.png') },
];

const API_BASE_URL = 'http://10.108.5.101:8080/api/v1';
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

import { useEffect, useState, useRef } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

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
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region | null>(null);

  const [reports, setReports] = useState<{ id: string; type: string; latitude: number; longitude: number; timestamp: number; creatorSessionId?: string }[]>([]);
  const [pendingLocation, setPendingLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const [isReportModalVisible, setReportModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const handleNotificationResponse = (response: 'still_there' | 'not_there') => {
    console.log('User responded to OS notification:', response);
    // Here you will eventually emit a WebSocket message
  };

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const actionIdentifier = response.actionIdentifier;
      if (actionIdentifier === 'still_there' || actionIdentifier === 'not_there') {
        handleNotificationResponse(actionIdentifier);
      }
    });
    return () => subscription.remove();
  }, []);


  const fetchNearbyAlerts = async (lat: number, lon: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/alerts/nearby?latitude=${lat}&longitude=${lon}`);
      if (response.ok) {
        const data = await response.json();
        const mappedReports = data.map((item: any) => ({
          id: item.alertId.toString(),
          type: TYPE_ID_TO_ALERT_ID[item.typeId] || 'Fire',
          latitude: item.latitude,
          longitude: item.longitude,
          timestamp: new Date(item.timeOfReport || Date.now()).getTime(),
          creatorSessionId: item.creatorSessionId,
        }));
        setReports(mappedReports);
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
      setReportModalVisible(true);
    } catch (error) {
      console.warn('Could not get precise location for the report', error);
      if (region) {
        setPendingLocation({
          latitude: region.latitude,
          longitude: region.longitude,
        });
        setReportModalVisible(true);
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
      setReportModalVisible(false);

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
          setReports(prev => prev.map(r => r.id === optimisticId ? { ...r, id: createdAlert.alertId.toString() } : r));
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
      }
    })();
  }, []);

  if (!region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
        followsUserLocation={true}
        onRegionChangeComplete={(r) => fetchNearbyAlerts(r.latitude, r.longitude)}
      >
        {reports.map((report) => (
          <Marker
            key={report.id}
            coordinate={{ latitude: report.latitude, longitude: report.longitude }}
            onPress={(e) => {
              e.stopPropagation();
              setSelectedReport(report);
            }}
          >
            <View style={styles.markerContainer}>
              <Image
                source={ALERTS.find(a => a.id === report.type)?.icon}
                style={styles.markerIcon}
                resizeMode="contain"
              />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Test Button for OS Notification */}
      <TouchableOpacity 
        style={styles.testNotificationButton} 
        onPress={async () => {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "⚠️ Alert is close",
              body: "Please confirm if the alert is still valid.",
              categoryIdentifier: "alert_proximity",
            },
            trigger: null,
          });
        }}
      >
        <Text style={{color: 'white', fontWeight: 'bold'}}>Test OS Alert</Text>
      </TouchableOpacity>

      <View style={styles.reportButtonContainer}>
        <TouchableOpacity style={styles.reportButton} onPress={handleReportPress}>
          <Text style={styles.reportButtonText}>Report</Text>
        </TouchableOpacity>
      </View>

      {/* Report Modal */}
      <Modal
        visible={isReportModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackground} activeOpacity={1} onPress={() => setReportModalVisible(false)} />
          <View style={styles.bottomSheet}>
            <View style={styles.dragHandle} />

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
          </View>
        </View>
      </Modal>

      {/* Pin Details Modal */}
      <Modal
        visible={!!selectedReport}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedReport(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackground} activeOpacity={1} onPress={() => setSelectedReport(null)} />
          <View style={styles.bottomSheetDetails}>
            <View style={styles.dragHandle} />
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
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testNotificationButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    zIndex: 10,
  },
  reportButtonContainer: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    alignItems: 'center',
  },
  reportButton: {
    backgroundColor: 'rgba(255, 100, 100, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  reportButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 250,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#ccc',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
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
    padding: 24,
    minHeight: 180,
  },
  detailsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
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
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  detailsTime: {
    fontSize: 16,
    color: '#666',
  },
  deleteButton: {
    backgroundColor: '#ff4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 10,
    alignSelf: 'flex-start'
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: 'bold'
  },
});
