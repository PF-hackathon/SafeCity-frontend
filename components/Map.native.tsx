import { StyleSheet, View, ActivityIndicator, TouchableOpacity, Text, Modal, Image } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Region, Marker } from 'react-native-maps';

const ALERTS = [
  { id: 'Bad Infrastructure', label: 'Bad Infrastructure', icon: require('@/assets/alert-icons/Bad_Infrastructure.png') },
  { id: 'Fire', label: 'Fire', icon: require('@/assets/alert-icons/Fire.png') },
  { id: 'Harm', label: 'Harm', icon: require('@/assets/alert-icons/Harm.png') },
  { id: 'Dark Area', label: 'Dark Area', icon: require('@/assets/alert-icons/Dark_Area.png') },
  { id: 'Theft', label: 'Theft', icon: require('@/assets/alert-icons/Theft.png') },
];

import { useEffect, useState, useRef } from 'react';
import * as Location from 'expo-location';

export default function Map() {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region | null>(null);

  const [reports, setReports] = useState<{ id: string; type: string; latitude: number; longitude: number; timestamp: number }[]>([]);
  const [pendingLocation, setPendingLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const [isReportModalVisible, setReportModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);

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

  const handleCreateReport = (type: string) => {
    if (pendingLocation) {
      setReports(prev => [...prev, {
        id: Math.random().toString(),
        type,
        latitude: pendingLocation.latitude,
        longitude: pendingLocation.longitude,
        timestamp: Date.now(),
      }]);
    }
    setReportModalVisible(false);
  };

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access location was denied');
        setRegion({
          latitude: 42.6977, // Sofia coordinates by default
          longitude: 23.3219,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
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
      } catch (error) {
        console.warn('Error fetching location:', error);
        // Fallback to Sofia if an error occurs but permissions were granted
        setRegion({
          latitude: 42.6977,
          longitude: 23.3219,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
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
});
