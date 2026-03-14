import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import { useColorScheme } from '@/hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if splash screen is already controlled elsewhere.
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isLaunchAnimationDone, setIsLaunchAnimationDone] = useState(false);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;
  const dotOne = useRef(new Animated.Value(0.25)).current;
  const dotTwo = useRef(new Animated.Value(0.25)).current;
  const dotThree = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const pulseDot = (value: Animated.Value) =>
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(value, {
          toValue: 0.25,
          duration: 320,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ]);

    const logoAnimation = Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.2)),
      }),
    ]);

    const loadingDots = Animated.loop(
      Animated.stagger(140, [pulseDot(dotOne), pulseDot(dotTwo), pulseDot(dotThree)]),
      { resetBeforeIteration: false }
    );

    logoAnimation.start();
    loadingDots.start();

    const finishTimer = setTimeout(async () => {
      loadingDots.stop();
      setIsLaunchAnimationDone(true);
      await SplashScreen.hideAsync();
    }, 1500);

    return () => {
      clearTimeout(finishTimer);
      loadingDots.stop();
    };
  }, [dotOne, dotTwo, dotThree, logoOpacity, logoScale]);

  if (!isLaunchAnimationDone) {
    return (
      <GestureHandlerRootView style={styles.flexOne}>
        <View style={styles.launchScreen}>
          <Animated.Image
            source={require('@/assets/images/splash-icon.png')}
            style={[
              styles.launchLogo,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}
            resizeMode="contain"
          />

          <View style={styles.dotsRow}>
            <Animated.View style={[styles.dot, { opacity: dotOne }]} />
            <Animated.View style={[styles.dot, { opacity: dotTwo }]} />
            <Animated.View style={[styles.dot, { opacity: dotThree }]} />
          </View>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  launchScreen: {
    flex: 1,
    backgroundColor: '#0E5A8A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
  },
  launchLogo: {
    width: 132,
    height: 132,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
});
