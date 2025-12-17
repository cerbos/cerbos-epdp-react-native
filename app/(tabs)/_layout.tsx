import { Tabs } from 'expo-router';
import React from 'react';

import { CerbosEpdpProvider } from '@/components/cerbos-epdp-context';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <CerbosEpdpProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          headerShown: false,
          tabBarButton: HapticTab,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'ePDP',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="check-resource"
          options={{
            title: 'checkResource',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="checkmark.circle.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="check-resources"
          options={{
            title: 'checkResources',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="checklist" color={color} />,
          }}
        />
        <Tabs.Screen
          name="plan-resources"
          options={{
            title: 'planResources',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="list.bullet.rectangle.portrait" color={color} />,
          }}
        />
        <Tabs.Screen
          name="audit-log"
          options={{
            title: 'Audit',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="doc.text.magnifyingglass" color={color} />,
          }}
        />

      </Tabs>
    </CerbosEpdpProvider>
  );
}
