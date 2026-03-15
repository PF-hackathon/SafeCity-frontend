import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { ChevronRight, Bell, Moon, Sun, Smartphone } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useThemeContext } from '@/context/ThemeContext';

export default function SettingsScreen() {
  const { theme, colorScheme, setTheme } = useThemeContext();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const isDark = colorScheme === 'dark';
  const bgColor = isDark ? '#1C1C1E' : '#F2F2F7';
  const cardColor = isDark ? '#2C2C2E' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const secondaryTextColor = isDark ? '#EBEBF599' : '#3C3C4399';
  const dividerColor = isDark ? '#38383A' : '#C6C6C8';

  useEffect(() => {
    // Check initial notification status
    const checkPermissions = async () => {
      const { status } = await Notifications.getPermissionsAsync();
      setNotificationsEnabled(status === 'granted');
    };
    checkPermissions();
  }, []);

  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    triggerHaptic();
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in your system settings.',
          [{ text: 'OK' }]
        );
        setNotificationsEnabled(false);
      } else {
        setNotificationsEnabled(true);
      }
    } else {
      Alert.alert(
        'Disable Notifications',
        'To disable notifications, please go to your system settings.',
        [{ text: 'OK' }]
      );
      // We visually revert the switch if they can't natively toggle it off here, OR we can let it sit visually off but it requires system settings.
      // Easiest approach for React Native without linking to settings is to reset it.
      setNotificationsEnabled(true);
    }
  };

  const renderThemeOption = (
    label: string,
    value: 'system' | 'light' | 'dark',
    Icon: any
  ) => {
    const isSelected = theme === value;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.themeOption,
          { backgroundColor: pressed ? (isDark ? '#3A3A3C' : '#E5E5EA') : cardColor },
        ]}
        onPress={() => {
          triggerHaptic();
          setTheme(value);
        }}
      >
        <View style={styles.themeOptionLeft}>
          <Icon size={20} color={textColor} style={styles.themeIcon} />
          <Text style={[styles.themeOptionText, { color: textColor }]}>{label}</Text>
        </View>
        <View style={styles.radioContainer}>
          {isSelected && <View style={styles.radioSelected} />}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Text style={[styles.sectionTitle, { color: secondaryTextColor }]}>APPEARANCE</Text>
      <View style={[styles.card, { backgroundColor: cardColor }]}>
        {renderThemeOption('System Default', 'system', Smartphone)}
        <View style={[styles.divider, { backgroundColor: dividerColor }]} />
        {renderThemeOption('Light', 'light', Sun)}
        <View style={[styles.divider, { backgroundColor: dividerColor }]} />
        {renderThemeOption('Dark', 'dark', Moon)}
      </View>

      <Text style={[styles.sectionTitle, { color: secondaryTextColor, marginTop: 30 }]}>
        NOTIFICATIONS
      </Text>
      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <View style={styles.listItem}>
          <View style={styles.listItemLeft}>
            <View style={[styles.iconContainer, { backgroundColor: '#34C759' }]}>
              <Bell size={18} color="#fff" />
            </View>
            <Text style={[styles.listItemText, { color: textColor }]}>
              Push Notifications
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: '#767577', true: '#34C759' }}
            ios_backgroundColor="#3e3e3e"
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.versionText, { color: secondaryTextColor }]}>
          SafeCity v1.0.0
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 16,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  themeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeIcon: {
    marginRight: 12,
  },
  themeOptionText: {
    fontSize: 17,
  },
  radioContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  listItemText: {
    fontSize: 17,
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 13,
  },
});
